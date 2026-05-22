/**
 * Real GIS-backed `DriveClient` over the Drive v3 REST API.
 *
 * This module compiles in Node (no top-level `fetch`/`window` access at module
 * scope) but requires a browser at runtime through {@link DriveAuth}. There is
 * no test coverage that hits the real network — see the README for manual
 * integration test instructions.
 *
 * The Picker integration lives in `picker.ts`. This client only knows about
 * REST + auth + the WRITE_ALLOWED_PREFIX guard.
 */

import type { DriveAuth } from './auth.js';
import { assertUnderPrefix, normalizePath } from './guard.js';
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

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

/** Fields requested on every metadata read. */
const META_FIELDS = 'id,name,parents,mimeType,headRevisionId,modifiedTime';

export interface RealDriveClientOptions {
  auth: DriveAuth;
  /** WRITE_ALLOWED_PREFIX. Required — see ADR-0003. */
  allowedPrefix: string;
  /**
   * Resolver from a Drive file id to its canonical path under the Travel
   * folder. Supplied by the caller because path discovery requires walking up
   * the parent chain and we don't want that logic in the client.
   *
   * The caller (typically the worker) caches paths in Dexie.
   */
  resolvePath: (fileId: FileId) => Promise<string>;
  /** Inject `fetch` for testability. Defaults to the global. */
  fetchImpl?: typeof fetch;
  /** Open the Picker SDK. Optional; tests use the in-memory fake. */
  openPicker?: () => Promise<FolderPick>;
}

export class RealDriveClient implements DriveClient {
  private readonly auth: DriveAuth;
  private readonly allowedPrefix: string;
  private readonly resolvePath: (fileId: FileId) => Promise<string>;
  private readonly fetchImpl: typeof fetch;
  private readonly openPicker?: () => Promise<FolderPick>;

  constructor(opts: RealDriveClientOptions) {
    this.auth = opts.auth;
    this.allowedPrefix = opts.allowedPrefix;
    this.resolvePath = opts.resolvePath;
    const fallbackFetch: typeof fetch = () => {
      throw new Error('fetch is not available in this environment');
    };
    this.fetchImpl =
      opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : fallbackFetch);
    if (opts.openPicker) this.openPicker = opts.openPicker;
  }

  async getMetadata(fileId: FileId): Promise<FileMetadata> {
    const raw = await this.api<RawDriveFile>(
      `${API}/files/${encodeURIComponent(fileId)}?fields=${META_FIELDS}`,
      { method: 'GET' },
    );
    return toFileMetadata(raw, await this.resolvePath(fileId));
  }

  async getContent(fileId: FileId): Promise<{ content: string; revision: RevisionId }> {
    // The Drive content endpoint streams raw bytes; we ask for text.
    const resp = await this.authed(
      `${API}/files/${encodeURIComponent(fileId)}?alt=media`,
      { method: 'GET' },
    );
    if (!resp.ok) {
      throw new DriveApiError(
        `getContent ${fileId} failed`,
        resp.status,
        await safeText(resp),
      );
    }
    const content = await resp.text();
    // Drive content endpoint doesn't return headRevisionId — fetch metadata
    // separately. Cheap and necessary for ADR-0006.
    const meta = await this.api<RawDriveFile>(
      `${API}/files/${encodeURIComponent(fileId)}?fields=headRevisionId`,
      { method: 'GET' },
    );
    return { content, revision: asRevisionId(meta.headRevisionId ?? '') };
  }

  async listFolder(folderId: FileId): Promise<readonly FileMetadata[]> {
    const q = `'${folderId}' in parents and trashed = false`;
    const url = `${API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(
      `files(${META_FIELDS})`,
    )}&pageSize=1000`;
    const out = await this.api<{ files?: RawDriveFile[] }>(url, { method: 'GET' });
    return Promise.all(
      (out.files ?? []).map(async (raw) =>
        toFileMetadata(raw, await this.resolvePath(asFileId(raw.id))),
      ),
    );
  }

  async createFile(input: CreateFileInput): Promise<FileMetadata> {
    assertUnderPrefix(input.resolvedPath, this.allowedPrefix);
    const metadata = {
      name: input.name,
      parents: [input.parentId],
      mimeType: input.mimeType,
    };
    return this.multipartUpload(
      `${UPLOAD_API}/files?uploadType=multipart&fields=${META_FIELDS}`,
      metadata,
      input,
      'POST',
      normalizePath(input.resolvedPath),
    );
  }

  async updateFile(input: UpdateFileInput): Promise<FileMetadata> {
    const resolved = assertUnderPrefix(input.resolvedPath, this.allowedPrefix);
    const metadata: Record<string, unknown> = {};
    if (input.mimeType) metadata.mimeType = input.mimeType;
    return this.multipartUpload(
      `${UPLOAD_API}/files/${encodeURIComponent(input.id)}?uploadType=multipart&fields=${META_FIELDS}`,
      metadata,
      input,
      'PATCH',
      resolved,
    );
  }

  async pickFolder(): Promise<FolderPick> {
    if (!this.openPicker) {
      throw new Error(
        'pickFolder() requires the Picker SDK wrapper — pass openPicker to RealDriveClient.',
      );
    }
    return this.openPicker();
  }

  async getChanges(pageToken: string): Promise<DriveChangeBatch> {
    const url =
      `${API}/changes?pageToken=${encodeURIComponent(pageToken)}` +
      `&fields=${encodeURIComponent(`nextPageToken,changes(removed,fileId,file(${META_FIELDS}))`)}`;
    const raw = await this.api<{
      nextPageToken?: string;
      newStartPageToken?: string;
      changes?: { removed?: boolean; fileId?: string; file?: RawDriveFile }[];
    }>(url, { method: 'GET' });

    const changes: DriveChange[] = await Promise.all(
      (raw.changes ?? []).map(async (c): Promise<DriveChange> => {
        const fileId = asFileId(c.fileId ?? c.file?.id ?? '');
        if (c.removed || !c.file) return { fileId, file: null, removed: true };
        return {
          fileId,
          file: toFileMetadata(c.file, await this.resolvePath(fileId)),
          removed: false,
        };
      }),
    );
    return {
      changes,
      nextPageToken: raw.nextPageToken ?? raw.newStartPageToken ?? pageToken,
    };
  }

  async startChangeToken(): Promise<string> {
    const out = await this.api<{ startPageToken: string }>(
      `${API}/changes/startPageToken`,
      { method: 'GET' },
    );
    return out.startPageToken;
  }

  // ---------- internals ----------

  private async authed(url: string, init: RequestInit): Promise<Response> {
    const token = await this.auth.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    return this.fetchImpl(url, { ...init, headers });
  }

  private async api<T>(url: string, init: RequestInit): Promise<T> {
    const resp = await this.authed(url, init);
    if (!resp.ok) {
      throw new DriveApiError(`${init.method ?? 'GET'} ${url}`, resp.status, await safeText(resp));
    }
    return (await resp.json()) as T;
  }

  private async multipartUpload(
    url: string,
    metadata: Record<string, unknown>,
    payload: { content?: string; mediaBytes?: Uint8Array; mimeType?: string },
    method: 'POST' | 'PATCH',
    resolvedPath: string,
  ): Promise<FileMetadata> {
    const boundary = `----yoman-${Math.random().toString(36).slice(2)}`;
    const contentType = payload.mimeType ?? 'text/markdown';

    const parts: BlobPart[] = [
      `--${boundary}\r\n`,
      'Content-Type: application/json; charset=UTF-8\r\n\r\n',
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\n`,
      `Content-Type: ${contentType}\r\n\r\n`,
    ];
    if (payload.mediaBytes) {
      parts.push(payload.mediaBytes);
    } else {
      parts.push(payload.content ?? '');
    }
    parts.push(`\r\n--${boundary}--`);

    const body = new Blob(parts, {
      type: `multipart/related; boundary=${boundary}`,
    });

    const resp = await this.authed(url, {
      method,
      body,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    });
    if (!resp.ok) {
      throw new DriveApiError(
        `${method} ${url} failed`,
        resp.status,
        await safeText(resp),
      );
    }
    const raw = (await resp.json()) as RawDriveFile;
    return toFileMetadata(raw, resolvedPath);
  }
}

interface RawDriveFile {
  id: string;
  name?: string;
  parents?: string[];
  mimeType?: string;
  headRevisionId?: string;
  modifiedTime?: string;
}

function toFileMetadata(raw: RawDriveFile, path: string): FileMetadata {
  return {
    id: asFileId(raw.id),
    name: raw.name ?? '',
    parents: (raw.parents ?? []).map(asFileId),
    mimeType: raw.mimeType ?? 'application/octet-stream',
    headRevisionId: asRevisionId(raw.headRevisionId ?? ''),
    modifiedTime: raw.modifiedTime ?? '',
    path,
    isFolder: raw.mimeType === 'application/vnd.google-apps.folder',
  };
}

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}
