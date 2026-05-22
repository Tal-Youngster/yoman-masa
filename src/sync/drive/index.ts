export type {
  DriveClient,
  FileMetadata,
  FileId,
  RevisionId,
  CreateFileInput,
  UpdateFileInput,
  DriveChange,
  DriveChangeBatch,
  FolderPick,
  AuthEvent,
} from './types.js';
export {
  WriteOutOfScopeError,
  ConflictExhaustedError,
  EditPointMissingError,
  ReauthRequiredError,
  DriveApiError,
  asFileId,
  asRevisionId,
} from './types.js';
export {
  assertUnderPrefix,
  isUnderPrefix,
  normalizePath,
  normalizePrefix,
  guardWrite,
} from './guard.js';
export { FakeDrive, FOLDER_MIME } from './fake.js';
export { DriveAuth, type AuthConfig, type AuthEventListener } from './auth.js';
export { RealDriveClient, type RealDriveClientOptions } from './client.js';
export { openFolderPicker, type PickerOptions } from './picker.js';
export { reconcileUpdate, type ReconcileOptions, type ReconcileResult } from './reconcile.js';
