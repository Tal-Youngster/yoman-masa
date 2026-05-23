import { describe, expect, it } from 'vitest';

import { FakeDrive } from '@/sync/drive/fake';
import {
  drainAll,
  MemoryWriteQueue,
  ReconcilerRegistry,
} from '@/sync/queue';
import type { WriteQueueItem } from '@/sync/queue';

import { ACTIVE_CONFIG, activeConfigReconciler } from './active-config';
import { activeConfigFilePath } from './paths';

const RESOLVED_PATH = activeConfigFilePath('MyVault/Travel');

function makeConfigItem(
  overrides: Partial<WriteQueueItem<{ active_trip_id: string | null }>> &
    Pick<WriteQueueItem<{ active_trip_id: string | null }>, 'op' | 'payload'>,
): WriteQueueItem<{ active_trip_id: string | null }> {
  return {
    id: `01H${Math.random().toString(36).slice(2, 12)}`,
    entityType: ACTIVE_CONFIG.entityType,
    entityId: ACTIVE_CONFIG.singletonId,
    fileId: null,
    baseRevision: null,
    resolvedPath: RESOLVED_PATH,
    attempts: 0,
    lastError: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('activeConfigReconciler — unit', () => {
  it('fromMarkdown parses JSON content', () => {
    expect(
      activeConfigReconciler.fromMarkdown('{"active_trip_id":"trp_x"}\n'),
    ).toEqual({ active_trip_id: 'trp_x' });
  });

  it('fromMarkdown returns null on malformed JSON or non-objects', () => {
    expect(activeConfigReconciler.fromMarkdown('')).toBeNull();
    expect(activeConfigReconciler.fromMarkdown('not json')).toBeNull();
    expect(activeConfigReconciler.fromMarkdown('[]')).toBeNull();
  });

  it('applyEdit sets active_trip_id and preserves unknown keys', () => {
    const original = '{"active_trip_id":"trp_old","theme":"sakura"}\n';
    const result = activeConfigReconciler.applyEdit(
      original,
      makeConfigItem({ op: 'update', payload: { active_trip_id: 'trp_new' } }),
    );
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed['active_trip_id']).toBe('trp_new');
    expect(parsed['theme']).toBe('sakura');
    expect(result.endsWith('\n')).toBe(true);
  });

  it('applyEdit on empty original produces a fresh JSON file', () => {
    const out = activeConfigReconciler.applyEdit(
      '',
      makeConfigItem({ op: 'create', payload: { active_trip_id: 'trp_first' } }),
    );
    expect(JSON.parse(out)).toEqual({ active_trip_id: 'trp_first' });
  });

  it('emits stable 2-space-indent JSON', () => {
    const out = activeConfigReconciler.applyEdit(
      '',
      makeConfigItem({ op: 'create', payload: { active_trip_id: null } }),
    );
    expect(out).toBe('{\n  "active_trip_id": null\n}\n');
  });
});

describe('activeConfigReconciler — conflict reconciliation', () => {
  it('concurrent write to the same key: reapply lands and our value wins', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(activeConfigReconciler);

    // Seed an existing config.json with id=A and an unknown key the user
    // added by hand.
    const fileId = drive.seedFile({
      name: 'config.json',
      parent: drive.travelFolderId,
      path: RESOLVED_PATH,
      content: '{\n  "active_trip_id": "trp_A",\n  "theme": "sakura"\n}\n',
    });
    const base = (await drive.getMetadata(fileId)).headRevisionId;

    // Obsidian (or another client) changes active_trip_id between our
    // enqueue and our write — we still want our value to land, but the
    // unknown `theme` key must survive.
    drive.externalEdit(
      fileId,
      '{\n  "active_trip_id": "trp_B",\n  "theme": "sakura",\n  "extra": 1\n}\n',
    );

    await queue.enqueue(
      makeConfigItem({
        op: 'update',
        payload: { active_trip_id: 'trp_target' },
        fileId,
        baseRevision: base,
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
    const parsed = JSON.parse(content) as Record<string, unknown>;
    expect(parsed['active_trip_id']).toBe('trp_target');
    expect(parsed['theme']).toBe('sakura');
    expect(parsed['extra']).toBe(1);
  });

  it('creates the file on first write when none exists yet', async () => {
    const drive = new FakeDrive();
    const queue = new MemoryWriteQueue();
    const registry = new ReconcilerRegistry();
    registry.register(activeConfigReconciler);

    // Seed the parent `.travel` folder so the create has a place to land.
    const dotTravelId = drive.seedFolder({
      name: '.travel',
      parents: [drive.travelFolderId],
      path: 'MyVault/Travel/.travel',
    });

    await queue.enqueue(
      makeConfigItem({
        op: 'create',
        payload: { active_trip_id: 'trp_first' },
      }),
    );

    const report = await drainAll({
      drive,
      queue,
      reconcilers: registry,
      resolveParent: () => Promise.resolve(dotTravelId),
    });
    expect(report.applied).toBe(1);

    const children = await drive.listFolder(dotTravelId);
    const cfg = children.find((c) => c.name === 'config.json');
    expect(cfg).toBeDefined();
    if (!cfg) throw new Error('unreachable');
    const { content } = await drive.getContent(cfg.id);
    expect(JSON.parse(content)).toEqual({ active_trip_id: 'trp_first' });
  });
});
