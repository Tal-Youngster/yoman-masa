/**
 * Conflict reconciliation per ADR-0006.
 *
 * Algorithm (for updates):
 *   1. Re-fetch the file's headRevisionId.
 *   2. If unchanged from `baseRevision`: serialize new content, `files.update`.
 *   3. If changed: download, apply the queued structured edit to fresh content
 *      via the reconciler's `applyEdit`, then write.
 *   4. After write, re-fetch headRevisionId. If a third writer landed in
 *      between, repeat (budget: 3 attempts, exponential backoff).
 *
 * Creates skip step 1 (there's no base revision); they just call createFile.
 *
 * Deletes are out of scope for v1 (no slices delete vault files yet); the
 * worker rejects them with a clear error so we notice if one slips in.
 */

import type { Reconciler } from '../queue/reconciler.js';
import type { WriteQueueItem } from '../queue/types.js';
import {
  ConflictExhaustedError,
  EditPointMissingError,
  type DriveClient,
  type FileId,
  type RevisionId,
  asFileId,
  asRevisionId,
} from './types.js';

export interface ReconcileOptions {
  /** Max attempts. ADR-0006 says budget 3. */
  maxAttempts?: number;
  /** Base delay in ms; multiplied by `2^(attempt-1)`. Defaults to 100ms. */
  backoffBaseMs?: number;
  /** Override sleep for tests (default uses setTimeout). */
  sleep?: (ms: number) => Promise<void>;
}

export interface ReconcileResult {
  fileId: FileId;
  newRevision: RevisionId;
  attempts: number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Reconcile a single update item. Throws `ConflictExhaustedError` after the
 * budget is spent; throws `EditPointMissingError` if the structured edit
 * point disappears (the worker dead-letters these).
 */
export async function reconcileUpdate(
  drive: DriveClient,
  reconciler: Reconciler<unknown, unknown>,
  item: WriteQueueItem,
  options: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const maxAttempts = options.maxAttempts ?? 3;
  const backoffBase = options.backoffBaseMs ?? 100;
  const sleep = options.sleep ?? defaultSleep;

  if (!item.fileId) {
    throw new Error(
      `reconcileUpdate called for item ${item.id} without a fileId — use reconcileCreate.`,
    );
  }
  const fileId = asFileId(item.fileId);

  let lastSeenRevision: RevisionId = asRevisionId(item.baseRevision ?? '');
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;

    // Step 1: re-fetch revision + content. We always read content because step
    // 3's path needs it; for the unchanged case we still need *some* original
    // content to pass to `toMarkdown`. Cheap in our usage.
    const { content: fresh, revision: freshRevision } = await drive.getContent(fileId);
    lastSeenRevision = freshRevision;

    const concurrentEdit =
      item.baseRevision !== null && freshRevision !== item.baseRevision;

    // Step 2/3: build the new content. If there was a concurrent edit, the
    // reconciler reapplies its surgical edit on top of fresh content. If not,
    // the same path works (it's the no-op concurrent case).
    let nextContent: string;
    try {
      nextContent = reconciler.applyEdit(fresh, item);
    } catch (cause) {
      if (cause instanceof EditPointMissingError) throw cause;
      // Wrap unknown reconciler failures so the worker can route them.
      throw cause;
    }

    if (nextContent === fresh && !concurrentEdit) {
      // No-op write — nothing to do. Treat as applied at the current revision.
      return { fileId, newRevision: freshRevision, attempts: attempt };
    }

    // Step 2/3 cont.: write.
    const updated = await drive.updateFile({
      id: fileId,
      content: nextContent,
      resolvedPath: item.resolvedPath,
    });

    // Step 4: post-write recheck. If headRevisionId moved beyond what we just
    // wrote, a third writer raced us — retry.
    const post = await drive.getMetadata(fileId);
    if (post.headRevisionId === updated.headRevisionId) {
      return { fileId, newRevision: updated.headRevisionId, attempts: attempt };
    }

    // Someone else landed between our write and our recheck. Back off and retry.
    lastSeenRevision = post.headRevisionId;
    await sleep(backoffBase * 2 ** (attempt - 1));
  }

  throw new ConflictExhaustedError(fileId, attempt, lastSeenRevision);
}
