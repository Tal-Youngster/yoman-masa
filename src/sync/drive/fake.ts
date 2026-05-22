/**
 * In-memory `DriveClient` implementation. Backed by JS Maps. Deterministic.
 *
 * Usable from tests and from `dev` mode (a feature flag could point the worker
 * at this instead of the real client during development).
 *
 * Revisions are monotonically increasing counters per file, formatted as the
 * file id + `:` + counter. That makes them easy to assert on in tests while
 * still being opaque to callers (per ADR-0006 they're treated as opaque).
 */

import {
  asFileId,
  asRevisionId,
  DriveApiError,
  type CreateFileInput,
  type DriveChange,
  type DriveChangeBatch,
  type DriveClient,
  type FileId,
  type FileMetadata,
  type FolderPick,
  type RevisionId,
  type UpdateFileInput,
} from './types.js';
import { guardWrite, normalizePath, normalizePrefix } from './guard.js';

interface FakeFile {
  meta: FileMetadata;
  /** Latest content (string mode). */
  content: string;
  /** Per-file revision counter. */
  revisionCounter: number;
  /** Ordered list of historical revisions in case a test needs to assert. */
  history: { revision: RevisionId; content: string; modifiedTime: string }[];
}

/** Hooks for tests to interpose between fake operations (e.g. simulate a concurrent edit). */
export interface FakeDriveHooks {
  /** Called BEFORE updateFile applies the change. Use to simulate mid-flight revision bumps. */
  beforeUpdate?: (fileId: FileId, current: FakeFile) => void | Promise<void>;
  /** Called BEFORE getContent returns. Use to mutate the file between read and write. */
  beforeGetContent?: (fileId: FileId, current: FakeFile) => void | Promise<void>;
}

export interface FakeDriveOptions {
  /** Root folder name (e.g. `MyVault`). Defaults to `MyVault`. */
  rootName?: string;
  /** Initial clock — used for `modifiedTime`. Defaults to a fixed epoch. */
  initialTime?: number;
  /** Increment applied per write. Defaults to 1000ms. */
  timeStep?: number;
  /** WRITE_ALLOWED_PREFIX. Defaults to `<rootName>/Travel`. */
  allowedPrefix?: string;
  /** Test hooks. */
  hooks?: FakeDriveHooks;
}

let idCounter = 0;
const nextId = (kind: string): FileId =>
  asFileId(`${kind}-${(++idCounter).toString(36).padStart(6, '0')}`);

/** A minimal MIME type set; only the folder type is special-cased. */
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

/**
 * Create a fake Drive seeded with a root folder, a Travel folder, and an empty
 * change feed. Callers can `seedFile` or `seedFolder` to set up scenarios.
 */
export class FakeDrive implements DriveClient {
  readonly files = new Map<FileId, FakeFile>();
  /** Append-only list of changes; `getChanges` paginates through it. */
  readonly changes: DriveChange[] = [];
  readonly hooks: FakeDriveHooks;
  readonly allowedPrefix: string;

  readonly rootFolderId: FileId;
  readonly travelFolderId: FileId;

  private clock: number;
  private readonly timeStep: number;

  constructor(opts: FakeDriveOptions = {}) {
    const rootName = opts.rootName ?? 'MyVault';
    this.allowedPrefix = normalizePrefix(opts.allowedPrefix ?? `${rootName}/Travel`);
    this.clock = opts.initialTime ?? Date.parse('2026-01-01T00:00:00Z');
    this.timeStep = opts.timeStep ?? 1000;
    this.hooks = opts.hooks ?? {};

    this.rootFolderId = this.seedFolder({ name: rootName, parents: [], path: rootName });
    // The Travel folder lives under the root.
    this.travelFolderId = this.seedFolder({
      name: 'Travel',
      parents: [this.rootFolderId],
      path: `${rootName}/Travel`,
    });
  }

  /** Seed a folder. Returns its id. */
  seedFolder(input: { name: string; parents: readonly FileId[]; path: string }): FileId {
    const id = nextId('fld');
    const revision = asRevisionId(`${id}:0`);
    const time = this.tick();
    const meta: FileMetadata = {
      id,
      name: input.name,
      parents: input.parents,
      mimeType: FOLDER_MIME,
      headRevisionId: revision,
      modifiedTime: time,
      path: normalizePath(input.path),
      isFolder: true,
    };
    this.files.set(id, {
      meta,
      content: '',
      revisionCounter: 0,
      history: [{ revision, content: '', modifiedTime: time }],
    });
    this.changes.push({ fileId: id, file: meta, removed: false });
    return id;
  }

  /** Seed a file with known content and parent. Returns its id. */
  seedFile(input: {
    name: string;
    parent: FileId;
    path: string;
    content: string;
    mimeType?: string;
  }): FileId {
    const id = nextId('fil');
    const revision = asRevisionId(`${id}:0`);
    const time = this.tick();
    const meta: FileMetadata = {
      id,
      name: input.name,
      parents: [input.parent],
      mimeType: input.mimeType ?? 'text/markdown',
      headRevisionId: revision,
      modifiedTime: time,
      path: normalizePath(input.path),
      isFolder: false,
    };
    this.files.set(id, {
      meta,
      content: input.content,
      revisionCounter: 0,
      history: [{ revision, content: input.content, modifiedTime: time }],
    });
    this.changes.push({ fileId: id, file: meta, removed: false });
    return id;
  }

  /**
   * Test helper: simulate an external (Obsidian) edit to a file. Bumps the
   * revision and modifiedTime, returns the new revision.
   */
  externalEdit(fileId: FileId, newContent: string): RevisionId {
    const f = this.files.get(fileId);
    if (!f) throw new DriveApiError(`File not found: ${fileId}`, 404);
    return this.bumpRevision(f, newContent);
  }

  /** Test helper: remove a file. */
  externalRemove(fileId: FileId): void {
    const f = this.files.get(fileId);
    if (!f) return;
    this.files.delete(fileId);
    this.changes.push({ fileId, file: null, removed: true });
  }

  // ---------- DriveClient ----------

  getMetadata(fileId: FileId): Promise<FileMetadata> {
    const f = this.files.get(fileId);
    if (!f) return Promise.reject(new DriveApiError(`File not found: ${fileId}`, 404));
    return Promise.resolve({ ...f.meta });
  }

  async getContent(fileId: FileId): Promise<{ content: string; revision: RevisionId }> {
    const f = this.files.get(fileId);
    if (!f) throw new DriveApiError(`File not found: ${fileId}`, 404);
    await this.hooks.beforeGetContent?.(fileId, f);
    // Re-read after the hook to capture any external mutations it staged.
    const after = this.files.get(fileId);
    if (!after) throw new DriveApiError(`File removed during read: ${fileId}`, 404);
    return { content: after.content, revision: after.meta.headRevisionId };
  }

  listFolder(folderId: FileId): Promise<readonly FileMetadata[]> {
    const folder = this.files.get(folderId);
    if (!folder) return Promise.reject(new DriveApiError(`Folder not found: ${folderId}`, 404));
    if (!folder.meta.isFolder) {
      return Promise.reject(new DriveApiError(`Not a folder: ${folderId}`, 400));
    }
    const out: FileMetadata[] = [];
    for (const f of this.files.values()) {
      if (f.meta.parents.includes(folderId)) out.push({ ...f.meta });
    }
    return Promise.resolve(out);
  }

  createFile(input: CreateFileInput): Promise<FileMetadata> {
    try {
      guardWrite({ resolvedPath: input.resolvedPath }, this.allowedPrefix);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
    const parent = this.files.get(input.parentId);
    if (!parent || !parent.meta.isFolder) {
      return Promise.reject(new DriveApiError(`Parent folder not found: ${input.parentId}`, 404));
    }
    const id = nextId('fil');
    const revision = asRevisionId(`${id}:0`);
    const time = this.tick();
    const content = input.content ?? (input.mediaBytes ? bytesToString(input.mediaBytes) : '');
    const meta: FileMetadata = {
      id,
      name: input.name,
      parents: [input.parentId],
      mimeType: input.mimeType,
      headRevisionId: revision,
      modifiedTime: time,
      path: normalizePath(input.resolvedPath),
      isFolder: false,
    };
    this.files.set(id, {
      meta,
      content,
      revisionCounter: 0,
      history: [{ revision, content, modifiedTime: time }],
    });
    this.changes.push({ fileId: id, file: meta, removed: false });
    return Promise.resolve({ ...meta });
  }

  async updateFile(input: UpdateFileInput): Promise<FileMetadata> {
    guardWrite({ resolvedPath: input.resolvedPath }, this.allowedPrefix);
    const f = this.files.get(input.id);
    if (!f) throw new DriveApiError(`File not found: ${input.id}`, 404);

    await this.hooks.beforeUpdate?.(input.id, f);
    // Re-read in case the hook removed the file.
    const after = this.files.get(input.id);
    if (!after) throw new DriveApiError(`File removed mid-update: ${input.id}`, 404);

    const newContent =
      input.content ?? (input.mediaBytes ? bytesToString(input.mediaBytes) : after.content);
    this.bumpRevision(after, newContent);
    if (input.mimeType) {
      after.meta = { ...after.meta, mimeType: input.mimeType };
    }
    return { ...after.meta };
  }

  pickFolder(): Promise<FolderPick> {
    // Tests can override by spying; default returns the seeded Travel folder.
    const travel = this.files.get(this.travelFolderId);
    if (!travel) return Promise.reject(new DriveApiError('Travel folder missing in fake', 500));
    return Promise.resolve({ id: travel.meta.id, name: travel.meta.name, path: travel.meta.path });
  }

  getChanges(pageToken: string): Promise<DriveChangeBatch> {
    const start = parseInt(pageToken, 10);
    const from = Number.isFinite(start) && start >= 0 ? start : 0;
    const slice = this.changes.slice(from);
    return Promise.resolve({ changes: slice, nextPageToken: String(this.changes.length) });
  }

  startChangeToken(): Promise<string> {
    return Promise.resolve(String(this.changes.length));
  }

  // ---------- internals ----------

  private tick(): string {
    this.clock += this.timeStep;
    return new Date(this.clock).toISOString();
  }

  private bumpRevision(f: FakeFile, newContent: string): RevisionId {
    f.revisionCounter += 1;
    const revision = asRevisionId(`${f.meta.id}:${f.revisionCounter}`);
    const time = this.tick();
    f.content = newContent;
    f.meta = { ...f.meta, headRevisionId: revision, modifiedTime: time };
    f.history.push({ revision, content: newContent, modifiedTime: time });
    this.changes.push({ fileId: f.meta.id, file: f.meta, removed: false });
    return revision;
  }
}

function bytesToString(bytes: Uint8Array): string {
  // Tests treat bytes as UTF-8 text. Production code should call updateFile with `content`
  // for markdown and reserve `mediaBytes` for attachments (handled in S6).
  return new TextDecoder('utf-8').decode(bytes);
}
