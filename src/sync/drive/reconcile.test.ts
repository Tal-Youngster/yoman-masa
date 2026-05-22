import { describe, expect, it, vi } from 'vitest';

import { FakeDrive } from './fake.js';
import { reconcileUpdate } from './reconcile.js';
import { ConflictExhaustedError, EditPointMissingError, type FileId } from './types.js';
import type { Reconciler } from '../queue/reconciler.js';
import type { WriteQueueItem } from '../queue/types.js';

/**
 * A trivial reconciler that replaces the substring `<EDIT_POINT>` in the file's
 * body with the queued payload. Throws `EditPointMissingError` if the marker
 * is gone — useful to exercise the "structured edit point disappeared" path.
 */
const markerReconciler: Reconciler<unknown, string> = {
  entityType: 'marker',
  fromMarkdown: () => null,
  toMarkdown: () => '',
  applyEdit(originalContent, item) {
    if (!originalContent.includes('<EDIT_POINT>')) {
      throw new EditPointMissingError(item.fileId as FileId, '<EDIT_POINT>');
    }
    return originalContent.replace('<EDIT_POINT>', item.payload);
  },
};

function makeItem(
  overrides: Partial<WriteQueueItem<string>> & {
    fileId: string | null;
    baseRevision: string | null;
  },
): WriteQueueItem<string> {
  return {
    id: '01HXMARKER',
    entityType: 'marker',
    entityId: 'mk_01H',
    op: 'update',
    payload: 'PATCHED',
    attempts: 0,
    lastError: null,
    createdAt: '2026-05-01T00:00:00Z',
    resolvedPath: 'MyVault/Travel/marker.md',
    ...overrides,
  };
}

describe('reconcileUpdate', () => {
  it('happy path: unchanged base revision applies in 1 attempt', async () => {
    const drive = new FakeDrive();
    const id = drive.seedFile({
      name: 'marker.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/marker.md',
      content: 'hello <EDIT_POINT> world',
    });
    const base = (await drive.getMetadata(id)).headRevisionId;

    const result = await reconcileUpdate(drive, markerReconciler, makeItem({ fileId: id, baseRevision: base }));

    expect(result.attempts).toBe(1);
    const { content } = await drive.getContent(id);
    expect(content).toBe('hello PATCHED world');
  });

  it('mid-flight revision change: reapplies on fresh content and succeeds', async () => {
    const drive = new FakeDrive();
    const id = drive.seedFile({
      name: 'marker.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/marker.md',
      content: 'A <EDIT_POINT> B',
    });
    const base = (await drive.getMetadata(id)).headRevisionId;

    // Simulate a concurrent edit (Obsidian renames "A" → "A'") *before* our
    // worker calls getContent, but importantly leaving the edit point intact.
    drive.externalEdit(id, "A' <EDIT_POINT> B'");

    const result = await reconcileUpdate(drive, markerReconciler, makeItem({ fileId: id, baseRevision: base }));

    expect(result.attempts).toBe(1);
    const { content } = await drive.getContent(id);
    // Our patch lands on top of the *fresh* content, preserving Obsidian's changes.
    expect(content).toBe("A' PATCHED B'");
  });

  it('three-fold conflict: another writer lands between our write and recheck, succeeds on second attempt', async () => {
    const drive = new FakeDrive();
    const id = drive.seedFile({
      name: 'marker.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/marker.md',
      content: 'before <EDIT_POINT> after',
    });
    const base = (await drive.getMetadata(id)).headRevisionId;

    // Wire a hook that fires after our first updateFile lands a revision —
    // simulate a third writer that sneaks in BEFORE our post-write recheck.
    let firedRacePostWrite = false;
    let firstUpdateContent: string | null = null;
    const originalUpdate: typeof drive.updateFile = drive.updateFile.bind(drive);
    drive.updateFile = async (input) => {
      const out = await originalUpdate(input);
      if (!firedRacePostWrite) {
        firedRacePostWrite = true;
        firstUpdateContent = input.content ?? null;
        // Race: another writer immediately bumps the revision with new text
        // that still contains the edit point so our reapply can succeed.
        drive.externalEdit(id, 'before <EDIT_POINT> after (vault again)');
      }
      return out;
    };

    const result = await reconcileUpdate(
      drive,
      markerReconciler,
      makeItem({ fileId: id, baseRevision: base }),
      { backoffBaseMs: 0, sleep: () => Promise.resolve() },
    );

    expect(result.attempts).toBe(2);
    // First attempt patched onto the seeded content.
    expect(firstUpdateContent).toBe('before PATCHED after');
    // Second attempt patched onto the racing writer's content.
    const { content } = await drive.getContent(id);
    expect(content).toBe('before PATCHED after (vault again)');
  });

  it('exhausts the retry budget when conflicts continue', async () => {
    const drive = new FakeDrive();
    const id = drive.seedFile({
      name: 'marker.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/marker.md',
      content: 'forever <EDIT_POINT> forever',
    });
    const base = (await drive.getMetadata(id)).headRevisionId;

    // Race after every update: someone always bumps the revision.
    const originalUpdate: typeof drive.updateFile = drive.updateFile.bind(drive);
    drive.updateFile = async (input) => {
      const out = await originalUpdate(input);
      drive.externalEdit(id, 'forever <EDIT_POINT> forever (vault)');
      return out;
    };

    await expect(
      reconcileUpdate(drive, markerReconciler, makeItem({ fileId: id, baseRevision: base }), {
        maxAttempts: 3,
        backoffBaseMs: 0,
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toBeInstanceOf(ConflictExhaustedError);
  });

  it('surfaces EditPointMissingError when the structured edit point is gone', async () => {
    const drive = new FakeDrive();
    const id = drive.seedFile({
      name: 'marker.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/marker.md',
      content: '<EDIT_POINT>',
    });
    const base = (await drive.getMetadata(id)).headRevisionId;

    // Obsidian deletes the line containing our marker.
    drive.externalEdit(id, 'nothing here anymore');

    await expect(
      reconcileUpdate(drive, markerReconciler, makeItem({ fileId: id, baseRevision: base })),
    ).rejects.toBeInstanceOf(EditPointMissingError);
  });

  it('treats an identical reapplied write as a no-op (single attempt)', async () => {
    const drive = new FakeDrive();
    const id = drive.seedFile({
      name: 'marker.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/marker.md',
      // No edit-point marker present — but the reconciler's patch is a no-op
      // because the marker exists. Use a stub that always returns the input.
      content: 'unchanged',
    });
    const base = (await drive.getMetadata(id)).headRevisionId;
    const noopReconciler: Reconciler<unknown, string> = {
      entityType: 'marker',
      fromMarkdown: () => null,
      toMarkdown: () => '',
      applyEdit: (orig) => orig,
    };
    const result = await reconcileUpdate(
      drive,
      noopReconciler,
      makeItem({ fileId: id, baseRevision: base }),
    );
    expect(result.attempts).toBe(1);
    expect((await drive.getMetadata(id)).headRevisionId).toBe(base);
  });

  it('throws if called for a create-only item with no fileId', async () => {
    const drive = new FakeDrive();
    await expect(
      reconcileUpdate(drive, markerReconciler, makeItem({ fileId: null, baseRevision: '' })),
    ).rejects.toThrow(/without a fileId/);
  });

  it('respects custom maxAttempts knob', async () => {
    const drive = new FakeDrive();
    const id = drive.seedFile({
      name: 'marker.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/marker.md',
      content: '<EDIT_POINT>',
    });
    const base = (await drive.getMetadata(id)).headRevisionId;
    const originalUpdate: typeof drive.updateFile = drive.updateFile.bind(drive);
    drive.updateFile = async (input) => {
      const out = await originalUpdate(input);
      drive.externalEdit(id, '<EDIT_POINT>');
      return out;
    };
    const sleep = vi.fn(() => Promise.resolve());
    await expect(
      reconcileUpdate(drive, markerReconciler, makeItem({ fileId: id, baseRevision: base }), {
        maxAttempts: 2,
        backoffBaseMs: 0,
        sleep,
      }),
    ).rejects.toBeInstanceOf(ConflictExhaustedError);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
