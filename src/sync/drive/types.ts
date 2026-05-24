/**
 * Public surface for the Drive client. Both the real GIS-backed implementation
 * and the in-memory fake honor this contract.
 *
 * See:
 *  - docs/adr/0003-drive-integration.md  (auth, scope, picker, change feed)
 *  - docs/adr/0006-offline-sync.md       (revision-based conflict reconciliation)
 */

/** Drive `file.id`. Opaque string assigned by Drive. */
export type FileId = string & { readonly __brand: 'DriveFileId' };

/** Drive `headRevisionId` for a file. */
export type RevisionId = string & { readonly __brand: 'DriveRevisionId' };

export const asFileId = (id: string): FileId => id as FileId;
export const asRevisionId = (id: string): RevisionId => id as RevisionId;

/** Minimal metadata we care about. Mirrors Drive v3 `files.get` projection. */
export interface FileMetadata {
  id: FileId;
  name: string;
  /** Parent folder ids. Drive supports multiple but we only ever create with one. */
  parents: readonly FileId[];
  /** MIME type. Folders are `application/vnd.google-apps.folder`. */
  mimeType: string;
  /** Drive's `headRevisionId` — the per-revision pointer used for conflict detection. */
  headRevisionId: RevisionId;
  /** ISO timestamp of the most recent content modification, as reported by Drive. */
  modifiedTime: string;
  /** Resolved path of the file under the configured Travel root, e.g. `Trips/japan-2026/Trip.md`. */
  path: string;
  /** Whether this is a folder. Convenience flag. */
  isFolder: boolean;
}

export interface CreateFileInput {
  /** Parent folder id. Folder existence is the caller's responsibility. */
  parentId: FileId;
  name: string;
  /** UTF-8 string content; binary attachments use {@link CreateFileInput.mediaBytes}. */
  content?: string;
  /** Binary content. Mutually exclusive with {@link CreateFileInput.content}. */
  mediaBytes?: Uint8Array;
  mimeType: string;
  /**
   * Resolved path under the Travel root, used by the WRITE_ALLOWED_PREFIX guard.
   * Callers compose this from the parent folder's known path + the new file name.
   * Must not be empty and must not contain `..` segments.
   */
  resolvedPath: string;
}

export interface UpdateFileInput {
  id: FileId;
  /** UTF-8 string content. */
  content?: string;
  /** Binary content. Mutually exclusive with {@link UpdateFileInput.content}. */
  mediaBytes?: Uint8Array;
  /**
   * Resolved path of the existing file (as known to the caller). Re-checked by the guard.
   */
  resolvedPath: string;
  /**
   * MIME type for the upload. Optional — Drive will keep the existing one if omitted.
   */
  mimeType?: string;
}

/** Drive `changes.list` entry — the bits we surface. */
export interface DriveChange {
  fileId: FileId;
  /** `null` when the change is a removal/trashing. */
  file: FileMetadata | null;
  removed: boolean;
}

export interface DriveChangeBatch {
  changes: readonly DriveChange[];
  /** Token for the next call. Caller persists it. */
  nextPageToken: string;
}

export interface FolderPick {
  id: FileId;
  name: string;
  /** Absolute path under the Drive root, e.g. `MyVault/Travel`. */
  path: string;
}

/**
 * Discriminated union for the "Reconnect Drive" surface (ADR-0003 sharp edge).
 * Auth errors are surfaced as typed events rather than thrown so the UI can
 * route them without try/catch noise.
 */
export type AuthEvent =
  | { type: 'token-acquired'; expiresAt: number }
  | { type: 'token-expired' }
  | { type: 'reconnect-required'; reason: string };

export interface DriveClient {
  getMetadata(fileId: FileId): Promise<FileMetadata>;
  getContent(fileId: FileId): Promise<{ content: string; revision: RevisionId }>;
  listFolder(folderId: FileId): Promise<readonly FileMetadata[]>;
  createFolder(parentId: FileId, name: string): Promise<FileMetadata>;
  createFile(input: CreateFileInput): Promise<FileMetadata>;
  updateFile(input: UpdateFileInput): Promise<FileMetadata>;
  pickFolder(): Promise<FolderPick>;
  getChanges(pageToken: string): Promise<DriveChangeBatch>;
  /** Returns a fresh `startPageToken` for first-time setup. */
  startChangeToken(): Promise<string>;
}

// ---------- Errors ----------

/** Thrown by the WRITE_ALLOWED_PREFIX guard when a write target is out of scope. */
export class WriteOutOfScopeError extends Error {
  override readonly name = 'WriteOutOfScopeError';
  constructor(
    readonly attemptedPath: string,
    readonly allowedPrefix: string,
  ) {
    super(
      `Refusing to write to "${attemptedPath}": outside the allowed Travel prefix "${allowedPrefix}".`,
    );
  }
}

/** Thrown when the read-write-reread loop exhausted its retry budget. */
export class ConflictExhaustedError extends Error {
  override readonly name = 'ConflictExhaustedError';
  constructor(
    readonly fileId: FileId,
    readonly attempts: number,
    readonly lastRevision: RevisionId,
  ) {
    super(
      `Conflict reconciliation exhausted after ${attempts} attempts on ${fileId} (last seen ${lastRevision}).`,
    );
  }
}

/**
 * Thrown by a reconciler's `applyEdit` when the structured edit point (an entity
 * by id, or a list line by block-ref) is no longer present in the fresh file.
 * The worker surfaces this as a "needs attention" item per ADR-0006.
 */
export class EditPointMissingError extends Error {
  override readonly name = 'EditPointMissingError';
  constructor(
    readonly fileId: FileId,
    readonly editPointDescription: string,
  ) {
    super(
      `Edit point "${editPointDescription}" no longer exists in ${fileId} — the vault changed under us.`,
    );
  }
}

/** Thrown when an auth challenge can't be satisfied silently (e.g. incognito). */
export class ReauthRequiredError extends Error {
  override readonly name = 'ReauthRequiredError';
  constructor(reason: string) {
    super(`Reauthentication required: ${reason}`);
  }
}

/** Thrown for general Drive API failures we couldn't classify more specifically. */
export class DriveApiError extends Error {
  override readonly name = 'DriveApiError';
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody?: string,
  ) {
    super(`Drive API error (${status}): ${message}`);
  }
}
