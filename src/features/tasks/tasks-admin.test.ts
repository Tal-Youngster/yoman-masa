import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { makeTestDb } from '@/lib/storage/test-helpers';
import { TripId } from '@/domain/ids';
import type { WriteQueue, WriteQueueItem } from '@/sync/queue';
import { createTasksAdmin, type TaskScope } from './tasks-admin';
import type { TaskPayload } from './reconciler';

class InMemoryQueue implements WriteQueue {
  public readonly items: WriteQueueItem[] = [];
  enqueue(item: WriteQueueItem): Promise<void> {
    this.items.push(item);
    return Promise.resolve();
  }
  drainNext(): Promise<WriteQueueItem | null> {
    return Promise.resolve(this.items.shift() ?? null);
  }
  markFailed(): Promise<void> {
    return Promise.resolve();
  }
}

const TRIP = TripId.parse('trp_01HABCDEFGHJKMNPQRSTVWXYZ0');
const TRIP_SCOPE: TaskScope = { tripId: TRIP, slug: 'vietnam' };
const GENERAL_SCOPE: TaskScope = { tripId: null, slug: null };

function setup(name: string) {
  const db = makeTestDb(name);
  const queue = new InMemoryQueue();
  const admin = createTasksAdmin({
    db,
    writeQueue: queue,
    travelFolderPath: 'Vault/Travel',
    today: () => '2026-05-24',
  });
  return { db, queue, admin };
}

describe('tasksAdmin.addTask', () => {
  it('persists a trip task and enqueues a create against the trip Tasks.md', async () => {
    const { db, queue, admin } = setup('tasks-add-trip');
    const task = await admin.addTask(TRIP_SCOPE, { title: 'Book flights', tags: ['travel/flights'] });

    expect(task.trip_id).toBe(TRIP);
    expect(task.created_date).toBe('2026-05-24');
    expect(await db.tasks.get(task.id)).toMatchObject({ title: 'Book flights' });

    expect(queue.items).toHaveLength(1);
    const enq = queue.items[0] as WriteQueueItem<TaskPayload>;
    expect(enq.entityType).toBe('task');
    expect(enq.op).toBe('create');
    expect(enq.resolvedPath).toBe('Vault/Travel/Trips/vietnam/Tasks.md');
    expect(enq.payload.task.id).toBe(task.id);
  });

  it('targets the General Tasks.md for the null scope', async () => {
    const { admin, queue } = setup('tasks-add-general');
    const task = await admin.addTask(GENERAL_SCOPE, { title: 'Buy travel insurance' });
    expect(task.trip_id).toBeNull();
    expect(queue.items[0]?.resolvedPath).toBe('Vault/Travel/General/Tasks.md');
  });

  it('stamps done_date when created already done', async () => {
    const { admin } = setup('tasks-add-done');
    const task = await admin.addTask(TRIP_SCOPE, { title: 'Already finished', status: 'done' });
    expect(task.done_date).toBe('2026-05-24');
  });
});

describe('tasksAdmin.setStatus', () => {
  it('stamps done_date on completion and enqueues an update', async () => {
    const { db, queue, admin } = setup('tasks-status-done');
    const task = await admin.addTask(TRIP_SCOPE, { title: 'Pack bags' });
    await admin.setStatus(TRIP_SCOPE, task, 'done');

    const stored = await db.tasks.get(task.id);
    expect(stored?.status).toBe('done');
    expect(stored?.done_date).toBe('2026-05-24');
    expect(queue.items.at(-1)?.op).toBe('update');
  });

  it('clears done_date when re-opening a done task', async () => {
    const { db, admin } = setup('tasks-status-reopen');
    const task = await admin.addTask(TRIP_SCOPE, { title: 'Pack bags', status: 'done' });
    await admin.setStatus(TRIP_SCOPE, task, 'open');
    const stored = await db.tasks.get(task.id);
    expect(stored?.status).toBe('open');
    expect(stored?.done_date).toBeUndefined();
  });
});

describe('tasksAdmin.removeTask', () => {
  it('deletes locally and enqueues a delete', async () => {
    const { db, queue, admin } = setup('tasks-remove');
    const task = await admin.addTask(TRIP_SCOPE, { title: 'Obsolete' });
    await admin.removeTask(TRIP_SCOPE, task);
    expect(await db.tasks.get(task.id)).toBeUndefined();
    expect(queue.items.at(-1)?.op).toBe('delete');
  });
});

describe('tasksAdmin.listByScope', () => {
  it('separates trip tasks from General tasks', async () => {
    const { admin } = setup('tasks-list-scope');
    await admin.addTask(TRIP_SCOPE, { title: 'Trip task' });
    await admin.addTask(GENERAL_SCOPE, { title: 'General task' });

    const tripList = await admin.listByScope(TRIP_SCOPE);
    const generalList = await admin.listByScope(GENERAL_SCOPE);
    expect(tripList.map((t) => t.title)).toEqual(['Trip task']);
    expect(generalList.map((t) => t.title)).toEqual(['General task']);
  });
});
