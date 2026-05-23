import { describe, expect, it } from 'vitest';

import { isoDate } from '@/domain/dates';
import { currency } from '@/domain/money';
import { newTrip } from '@/domain/trip';

import { FakeDrive } from '@/sync/drive/fake';
import { ReconcilerRegistry } from '@/sync/queue';
import { drainAll } from '@/sync/queue';
import { MemoryWriteQueue } from '@/sync/queue';
import type { WriteQueueItem } from '@/sync/queue';

import { parseTrip, serializeTrip } from './parser';
import { tripReconciler, type TripPayload } from './reconciler';
import { tripFilePath } from './paths';

const sample = newTrip({
  slug: 'kyoto-2026',
  name: 'Kyoto 2026',
  start_date: isoDate('2026-09-01'),
  end_date: isoDate('2026-09-15'),
  home_currency: currency('USD'),
  status: 'planned',
});

function tripItem(
  overrides: Partial<WriteQueueItem<TripPayload>> & {
    op: 'create' | 'update';
    payload: TripPayload;
  },
): WriteQueueItem<TripPayload> {
  return {
    id: `01H${Math.random().toString(36).slice(2, 12)}`,
    entityType: 'trip',
    entityId: overrides.payload.trip.id,
    baseRevision: null,
    fileId: null,
    resolvedPath: 'MyVault/Travel/Trips/kyoto-2026/Trip.md',
    attempts: 0,
    lastError: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('tripReconciler — fromMarkdown / toMarkdown', () => {
  it('fromMarkdown parses a valid Trip.md', () => {
    const md = serializeTrip(sample, 'My notes\n');
    const trip = tripReconciler.fromMarkdown(md);
    expect(trip).toEqual(sample);
  });

  it('fromMarkdown returns null for non-trip content', () => {
    expect(tripReconciler.fromMarkdown('plain text')).toBeNull();
    expect(tripReconciler.fromMarkdown('---\ntype: accommodation\nname: x\n---\n')).toBeNull();
  });

  it('toMarkdown preserves body when originalContent is provided', () => {
    const original = serializeTrip(sample, 'Important notes\nKeep me.\n');
    const renamed = { ...sample, name: 'Kyoto 2026 (revised)' };
    const out = tripReconciler.toMarkdown(renamed, original);
    expect(out).toContain('Important notes');
    expect(out).toContain('Keep me.');
    expect(out).toContain('Kyoto 2026 (revised)');
  });
});

/**
 * Integration tests: full S3 read → write → re-read → reapply path against
 * FakeDrive. These are the load-bearing tests for the slice.
 */
describe('tripReconciler integration — FakeDrive + worker', () => {
  it('create: emits a frontmatter-only Trip.md at the expected path', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(tripReconciler);

    // Seed the slug folder so the worker has a parent for the file.
    const tripsFolderId = drive.seedFolder({
      name: 'Trips',
      parents: [drive.travelFolderId],
      path: 'MyVault/Travel/Trips',
    });
    const slugFolderId = drive.seedFolder({
      name: sample.slug,
      parents: [tripsFolderId],
      path: `MyVault/Travel/Trips/${sample.slug}`,
    });

    const filePath = tripFilePath('MyVault/Travel', sample.slug);
    await queue.enqueue(
      tripItem({
        op: 'create',
        payload: { trip: sample },
        resolvedPath: filePath,
      }),
    );

    const report = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      resolveParent: () => Promise.resolve(slugFolderId),
      reconcileOptions: { backoffBaseMs: 0, sleep: () => Promise.resolve() },
    });
    expect(report.applied).toBe(1);

    const children = await drive.listFolder(slugFolderId);
    const created = children.find((c) => c.name === 'Trip.md');
    expect(created).toBeDefined();
    if (!created) throw new Error('unreachable');
    const { content } = await drive.getContent(created.id);
    const parsed = parseTrip(content);
    expect(parsed.trip).toEqual(sample);
    expect(parsed.body).toBe(''); // frontmatter-only
  });

  it('update: changes name, preserves body and extra frontmatter', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(tripReconciler);

    const original = serializeTrip(sample, 'Day 1: Arashiyama\nDay 2: Fushimi\n', {
      extraFrontmatter: { theme: 'sakura' },
    });
    const filePath = tripFilePath('MyVault/Travel', sample.slug);
    const fileId = drive.seedFile({
      name: 'Trip.md',
      parent: drive.travelFolderId,
      path: filePath,
      content: original,
    });
    const base = (await drive.getMetadata(fileId)).headRevisionId;

    const renamed = { ...sample, name: 'Kyoto 2026 — updated' };
    await queue.enqueue(
      tripItem({
        op: 'update',
        payload: { trip: renamed },
        fileId,
        baseRevision: base,
        resolvedPath: filePath,
      }),
    );

    const report = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      reconcileOptions: { backoffBaseMs: 0, sleep: () => Promise.resolve() },
    });
    expect(report.applied).toBe(1);

    const { content } = await drive.getContent(fileId);
    const parsed = parseTrip(content);
    expect(parsed.trip.name).toBe('Kyoto 2026 — updated');
    expect(parsed.body).toContain('Day 1: Arashiyama');
    expect(parsed.body).toContain('Day 2: Fushimi');
    expect(parsed.extraFrontmatter).toEqual({ theme: 'sakura' });
  });

  it('mid-flight conflict: external edit before our update — reapply succeeds in one attempt', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(tripReconciler);

    const original = serializeTrip(sample, 'Original notes\n');
    const filePath = tripFilePath('MyVault/Travel', sample.slug);
    const fileId = drive.seedFile({
      name: 'Trip.md',
      parent: drive.travelFolderId,
      path: filePath,
      content: original,
    });
    const base = (await drive.getMetadata(fileId)).headRevisionId;

    // Obsidian appends to the body before we land our update.
    const externallyEdited = serializeTrip(sample, 'Original notes\nObsidian addition\n');
    drive.externalEdit(fileId, externallyEdited);

    const renamed = { ...sample, status: 'active' as const };
    await queue.enqueue(
      tripItem({
        op: 'update',
        payload: { trip: renamed },
        fileId,
        baseRevision: base,
        resolvedPath: filePath,
      }),
    );

    const report = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      reconcileOptions: { backoffBaseMs: 0, sleep: () => Promise.resolve() },
    });
    expect(report.applied).toBe(1);

    const { content } = await drive.getContent(fileId);
    const parsed = parseTrip(content);
    expect(parsed.trip.status).toBe('active');
    // The Obsidian addition survives our write (per ADR-0006).
    expect(parsed.body).toContain('Obsidian addition');
  });

  it('three-fold conflict: external edits keep landing — exhausts budget and SyncReport records the failure', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue({ retryBudget: 1 });
    const registry = new ReconcilerRegistry();
    registry.register(tripReconciler);

    const original = serializeTrip(sample, 'Notes\n');
    const filePath = tripFilePath('MyVault/Travel', sample.slug);
    const fileId = drive.seedFile({
      name: 'Trip.md',
      parent: drive.travelFolderId,
      path: filePath,
      content: original,
    });
    const base = (await drive.getMetadata(fileId)).headRevisionId;

    // Race after every update — third writer always lands new content with
    // the frontmatter still intact (so the reconciler's reapply succeeds but
    // the post-write recheck always sees a newer revision).
    const origUpdate: typeof drive.updateFile = drive.updateFile.bind(drive);
    drive.updateFile = async (input) => {
      const out = await origUpdate(input);
      drive.externalEdit(fileId, serializeTrip(sample, `vault writer ${Math.random()}\n`));
      return out;
    };

    await queue.enqueue(
      tripItem({
        op: 'update',
        payload: { trip: { ...sample, status: 'completed' as const } },
        fileId,
        baseRevision: base,
        resolvedPath: filePath,
      }),
    );

    const report = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      reconcileOptions: { maxAttempts: 3, backoffBaseMs: 0, sleep: () => Promise.resolve() },
    });
    expect(report.processed).toBe(1);
    expect(report.applied).toBe(0);
    expect(report.retried).toBe(1);
    // The memory queue dead-letters the row once its retryBudget is exceeded.
    expect(queue.inspect()[0]?.state).toBe('dead');
  });
});
