import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newTask } from '@/domain/task';
import { newTripId } from '@/domain/ids';
import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';
import type { TravelDB } from '@/lib/storage';
import { FakeDrive } from '@/sync/drive/fake';
import { InboundReconcilerRegistry, pullAll } from '@/sync/pull';

import { taskInboundReconciler } from './inbound';
import { serializeTasksFile } from './serializer';

let db: TravelDB;
beforeEach(() => {
  db = makeTestDb('task-inbound');
});
afterEach(async () => {
  db.close();
  await deleteDatabase(db.name);
});

const tripId = newTripId();
const t1 = newTask({ trip_id: tripId, title: 'Book flights', status: 'open' });
const t2 = newTask({ trip_id: tripId, title: 'Renew passport', status: 'done' });
const general = newTask({ trip_id: null, title: 'Buy travel adapter', status: 'open' });

function ensureFolder(
  drive: FakeDrive,
  name: string,
  parent: ReturnType<typeof drive.seedFolder>,
  path: string,
): ReturnType<typeof drive.seedFolder> {
  for (const f of drive.files.values()) {
    if (f.meta.name === name && f.meta.parents[0] === parent) return f.meta.id;
  }
  return drive.seedFolder({ name, parents: [parent], path });
}

describe('taskInboundReconciler', () => {
  it('matchesPath: claims both per-trip and General Tasks.md', () => {
    expect(taskInboundReconciler.matchesPath('Trips/argentina/Tasks.md')).toBe(true);
    expect(taskInboundReconciler.matchesPath('General/Tasks.md')).toBe(true);
  });

  it('matchesPath: rejects unrelated paths', () => {
    expect(taskInboundReconciler.matchesPath('Trips/argentina/Trip.md')).toBe(false);
    expect(taskInboundReconciler.matchesPath('Tasks.md')).toBe(false);
    expect(taskInboundReconciler.matchesPath('Trips/Argentina/Tasks.md')).toBe(false);
    expect(taskInboundReconciler.matchesPath('General/Other.md')).toBe(false);
    expect(taskInboundReconciler.matchesPath('Trips/x/Sub/Tasks.md')).toBe(false);
  });

  it('parseFile: returns every task in a per-trip file', () => {
    const md = serializeTasksFile({ tripId, tasks: [t1, t2] });
    const out = taskInboundReconciler.parseFile(md, 'Trips/argentina/Tasks.md');
    expect(out.map((t) => t.id).sort()).toEqual([t1.id, t2.id].sort());
  });

  it('parseFile: returns the General task (trip_id: null) from General/Tasks.md', () => {
    const md = serializeTasksFile({ tripId: null, tasks: [general] });
    const out = taskInboundReconciler.parseFile(md, 'General/Tasks.md');
    expect(out).toHaveLength(1);
    expect(out[0].trip_id).toBeNull();
    expect(out[0].id).toBe(general.id);
  });

  it('parseFile: returns [] for unparseable content', () => {
    expect(taskInboundReconciler.parseFile('not-frontmatter', 'x')).toEqual([]);
    expect(
      taskInboundReconciler.parseFile('---\ntype: trip\nid: trp_x\n---\n', 'x'),
    ).toEqual([]);
  });

  it('end-to-end: trip + General task files both land in Dexie', async () => {
    const drive = new FakeDrive();

    const trips = ensureFolder(drive, 'Trips', drive.travelFolderId, 'MyVault/Travel/Trips');
    const slug = ensureFolder(drive, 'argentina', trips, 'MyVault/Travel/Trips/argentina');
    drive.seedFile({
      name: 'Tasks.md',
      parent: slug,
      path: 'MyVault/Travel/Trips/argentina/Tasks.md',
      content: serializeTasksFile({ tripId, tasks: [t1, t2] }),
    });

    const generalFolder = ensureFolder(
      drive,
      'General',
      drive.travelFolderId,
      'MyVault/Travel/General',
    );
    drive.seedFile({
      name: 'Tasks.md',
      parent: generalFolder,
      path: 'MyVault/Travel/General/Tasks.md',
      content: serializeTasksFile({ tripId: null, tasks: [general] }),
    });

    const registry = new InboundReconcilerRegistry();
    registry.register(taskInboundReconciler);

    await pullAll({ drive, db, travelFolderId: drive.travelFolderId, registry });
    const stored = await db.tasks.toArray();
    expect(stored.map((t) => t.id).sort()).toEqual([t1.id, t2.id, general.id].sort());
    const generalStored = stored.find((t) => t.id === general.id);
    expect(generalStored?.trip_id).toBeNull();
  });

  it('removes a task that disappears from a Tasks.md between syncs', async () => {
    const drive = new FakeDrive();
    const trips = ensureFolder(drive, 'Trips', drive.travelFolderId, 'MyVault/Travel/Trips');
    const slug = ensureFolder(drive, 'argentina', trips, 'MyVault/Travel/Trips/argentina');
    const fileId = drive.seedFile({
      name: 'Tasks.md',
      parent: slug,
      path: 'MyVault/Travel/Trips/argentina/Tasks.md',
      content: serializeTasksFile({ tripId, tasks: [t1, t2] }),
    });

    const registry = new InboundReconcilerRegistry();
    registry.register(taskInboundReconciler);

    await pullAll({ drive, db, travelFolderId: drive.travelFolderId, registry });
    expect((await db.tasks.toArray()).length).toBe(2);

    drive.externalEdit(fileId, serializeTasksFile({ tripId, tasks: [t1] }));
    const report = await pullAll({
      drive,
      db,
      travelFolderId: drive.travelFolderId,
      registry,
    });
    expect(report.removed).toBeGreaterThanOrEqual(1);
    expect(await db.tasks.get(t2.id)).toBeUndefined();
    expect(await db.tasks.get(t1.id)).toBeDefined();
  });
});
