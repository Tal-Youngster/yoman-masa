import { describe, it, expect } from 'vitest';
import { TaskId, TripId } from '@/domain/ids';
import { Task } from '@/domain/task';
import type { WriteQueueItem, WriteOp } from '@/sync/queue';
import { taskReconciler, type TaskPayload } from './reconciler';
import { taskBlockRef } from './paths';

const TRIP = TripId.parse('trp_01HABCDEFGHJKMNPQRSTVWXYZ0');

function buildTask(overrides: Partial<Task> = {}): Task {
  return Task.parse({
    type: 'task',
    id: TaskId.parse('tsk_01HABCDEFGHJKMNPQRSTVWXYZ0'),
    trip_id: TRIP,
    title: 'Book flights',
    status: 'open',
    ...overrides,
  });
}

function item(task: Task, op: WriteOp): WriteQueueItem<TaskPayload> {
  return {
    id: 'wq_1',
    entityType: 'task',
    entityId: task.id,
    op,
    payload: { task },
    baseRevision: null,
    fileId: null,
    resolvedPath: 'Travel/Trips/trip/Tasks.md',
    attempts: 0,
    lastError: null,
    createdAt: '2026-05-24T00:00:00.000Z',
    nextAttemptAt: 0,
    dead: false,
  };
}

const EXISTING = `---
type: tasks
trip_id: trp_01HABCDEFGHJKMNPQRSTVWXYZ0
---

# Trip tasks

- [ ] Book flights ^t-01HABCDEFGHJKMNPQRSTVWXYZ0
- [x] Renew passport ✅ 2026-04-02 ^t-01HABCDEFGHJKMNPQRSTVWXYZ1

A note I keep here.
`;

describe('taskReconciler.applyEdit', () => {
  it('creates a new single-task file when content is empty', () => {
    const task = buildTask();
    const out = taskReconciler.applyEdit('', item(task, 'create'));
    expect(out).toContain('type: tasks');
    expect(out).toContain('trip_id: trp_01HABCDEFGHJKMNPQRSTVWXYZ0');
    expect(out).toContain(`^${taskBlockRef(task.id)}`);
  });

  it('replaces an existing line and leaves siblings + notes untouched', () => {
    const task = buildTask({ status: 'done', done_date: '2026-05-20' as Task['done_date'] });
    const out = taskReconciler.applyEdit(EXISTING, item(task, 'update'));
    expect(out).toContain('- [x] Book flights ✅ 2026-05-20 ^t-01HABCDEFGHJKMNPQRSTVWXYZ0');
    // Sibling task and free-form content survive.
    expect(out).toContain('- [x] Renew passport ✅ 2026-04-02 ^t-01HABCDEFGHJKMNPQRSTVWXYZ1');
    expect(out).toContain('# Trip tasks');
    expect(out).toContain('A note I keep here.');
  });

  it('preserves the existing line indentation on replace', () => {
    const indented = `---
type: tasks
---

  - [ ] Subtask here ^t-01HABCDEFGHJKMNPQRSTVWXYZ0
`;
    const task = buildTask({ trip_id: null, title: 'Subtask edited' });
    const out = taskReconciler.applyEdit(indented, item(task, 'update'));
    expect(out).toContain('  - [ ] Subtask edited ^t-01HABCDEFGHJKMNPQRSTVWXYZ0');
  });

  it('appends when the target line does not exist yet (insert)', () => {
    const newTask = buildTask({ id: TaskId.parse('tsk_01HABCDEFGHJKMNPQRSTVWXYZ9'), title: 'New thing' });
    const out = taskReconciler.applyEdit(EXISTING, item(newTask, 'update'));
    expect(out).toContain('- [ ] New thing ^t-01HABCDEFGHJKMNPQRSTVWXYZ9');
    // Original tasks are still present.
    expect(out).toContain('- [ ] Book flights ^t-01HABCDEFGHJKMNPQRSTVWXYZ0');
  });

  it('removes a line on delete', () => {
    const task = buildTask();
    const out = taskReconciler.applyEdit(EXISTING, item(task, 'delete'));
    expect(out).not.toContain('- [ ] Book flights ^t-01HABCDEFGHJKMNPQRSTVWXYZ0');
    expect(out).toContain('- [x] Renew passport ✅ 2026-04-02 ^t-01HABCDEFGHJKMNPQRSTVWXYZ1');
  });

  it('leaves content unchanged when deleting a line that is already gone', () => {
    const ghost = buildTask({ id: TaskId.parse('tsk_01HABCDEFGHJKMNPQRSTVWXYZ8') });
    const out = taskReconciler.applyEdit(EXISTING, item(ghost, 'delete'));
    expect(out).toBe(EXISTING);
  });
});
