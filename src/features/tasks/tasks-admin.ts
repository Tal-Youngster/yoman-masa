/**
 * Wiring between the tasks UI and the persistence + sync layers.
 *
 * Each mutation:
 *  1. Upserts the task in Dexie (the UI reads from Dexie, so this is instant).
 *  2. Enqueues a line-level write against the scope's `Tasks.md` file.
 *
 * A "scope" is either a trip (per-trip `Tasks.md`) or `null`/`null` for the
 * cross-trip General list. Like expenses, we enqueue with `fileId`/`baseRevision`
 * null and let the worker resolve the file by path and reconcile on conflict.
 *
 * Deletes follow the v1 vault convention: the row is removed locally and a
 * `delete` op is enqueued, but the sync worker dead-letters vault deletes — the
 * line stays in the file until the user removes it in Obsidian.
 */

import { ulid } from 'ulid';
import { z } from 'zod';
import { Task, TaskStatus, TaskPriority, newTask } from '@/domain/task';
import type { TripId } from '@/domain/ids';
import { IsoDate, todayIso } from '@/domain/dates';
import type { TravelDB } from '@/lib/storage';
import type { WriteQueue } from '@/sync/queue';
import { upsertTask, deleteTask, listTasksByTrip, listGeneralTasks } from './queries';
import type { TaskPayload } from './reconciler';
import { tasksFilePath } from './paths';

/** Identifies which `Tasks.md` a mutation targets. `null`/`null` = General. */
export interface TaskScope {
  tripId: TripId | null;
  slug: string | null;
}

const AddInput = z.object({
  title: z.string().min(1),
  status: TaskStatus.default('open'),
  priority: TaskPriority.optional(),
  due_date: IsoDate.optional(),
  scheduled_date: IsoDate.optional(),
  start_date: IsoDate.optional(),
  tags: z.array(z.string()).default([]),
});
export type AddTaskInput = z.input<typeof AddInput>;

export interface TasksAdminDeps {
  db?: TravelDB;
  writeQueue: WriteQueue;
  /** Vault path of the Travel folder, used to resolve the Tasks.md path. */
  travelFolderPath: string;
  /** `yyyy-mm-dd` today, in UTC. Tests inject; production passes the real value. */
  today?: () => string;
}

export interface TasksAdminService {
  addTask(scope: TaskScope, input: AddTaskInput): Promise<Task>;
  updateTask(scope: TaskScope, task: Task): Promise<void>;
  /** Flip status; stamps/clears `done_date` when crossing into/out of done. */
  setStatus(scope: TaskScope, task: Task, status: TaskStatus): Promise<void>;
  removeTask(scope: TaskScope, task: Task): Promise<void>;
  listByScope(scope: TaskScope): Promise<Task[]>;
}

export function createTasksAdmin(deps: TasksAdminDeps): TasksAdminService {
  const today = deps.today ?? (() => todayIso());

  async function enqueue(scope: TaskScope, task: Task, op: 'create' | 'update' | 'delete'): Promise<void> {
    const payload: TaskPayload = { task };
    await deps.writeQueue.enqueue({
      id: ulid(),
      entityType: 'task',
      entityId: task.id,
      op,
      payload,
      baseRevision: null,
      fileId: null,
      resolvedPath: tasksFilePath(deps.travelFolderPath, scope.slug),
      attempts: 0,
      lastError: null,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    async addTask(scope, input): Promise<Task> {
      const fields = AddInput.parse(input);
      const task = newTask({
        trip_id: scope.tripId,
        title: fields.title,
        status: fields.status,
        created_date: today(),
        ...(fields.priority ? { priority: fields.priority } : {}),
        ...(fields.due_date ? { due_date: fields.due_date } : {}),
        ...(fields.scheduled_date ? { scheduled_date: fields.scheduled_date } : {}),
        ...(fields.start_date ? { start_date: fields.start_date } : {}),
        ...(fields.status === 'done' ? { done_date: today() } : {}),
        tags: fields.tags,
      });
      await upsertTask(task, deps.db);
      await enqueue(scope, task, 'create');
      return task;
    },

    async updateTask(scope, task): Promise<void> {
      const updated = Task.parse(task);
      await upsertTask(updated, deps.db);
      await enqueue(scope, updated, 'update');
    },

    async setStatus(scope, task, status): Promise<void> {
      const becomingDone = status === 'done' && task.status !== 'done';
      const leavingDone = status !== 'done' && task.status === 'done';
      const next = Task.parse({
        ...task,
        status,
        ...(becomingDone ? { done_date: today() } : {}),
        ...(leavingDone ? { done_date: undefined } : {}),
      });
      await upsertTask(next, deps.db);
      await enqueue(scope, next, 'update');
    },

    async removeTask(scope, task): Promise<void> {
      await deleteTask(task.id, deps.db);
      await enqueue(scope, task, 'delete');
    },

    async listByScope(scope): Promise<Task[]> {
      return scope.tripId === null
        ? listGeneralTasks(deps.db)
        : listTasksByTrip(scope.tripId, deps.db);
    },
  };
}
