import type { TravelDB } from '@/lib/storage';
import {
  upsertTask as dbUpsert,
  getTask as dbGet,
  deleteTask as dbDelete,
  tasksByTrip as dbByTrip,
  generalTasks as dbGeneral,
} from '@/lib/storage/queries';
import type { Task } from '@/domain/task';
import type { TripId } from '@/domain/ids';

/**
 * Sort: open work first (by due date, undated last), then completed/cancelled.
 * Stable enough for a list view; the form/dashboard re-derive their own order.
 */
function compareTasks(a: Task, b: Task): number {
  const aDone = a.status === 'done' || a.status === 'cancelled';
  const bDone = b.status === 'done' || b.status === 'cancelled';
  if (aDone !== bDone) return aDone ? 1 : -1;
  const aDue = a.due_date ?? '9999-12-31';
  const bDue = b.due_date ?? '9999-12-31';
  if (aDue !== bDue) return aDue.localeCompare(bDue);
  return a.title.localeCompare(b.title);
}

export async function listTasksByTrip(tripId: TripId, db?: TravelDB): Promise<Task[]> {
  return (await dbByTrip(tripId, db)).sort(compareTasks);
}

export async function listGeneralTasks(db?: TravelDB): Promise<Task[]> {
  return (await dbGeneral(db)).sort(compareTasks);
}

export async function upsertTask(task: Task, db?: TravelDB): Promise<void> {
  await dbUpsert(task, db);
}

export async function getTask(id: Task['id'], db?: TravelDB): Promise<Task | undefined> {
  return dbGet(id, db);
}

export async function deleteTask(id: Task['id'], db?: TravelDB): Promise<void> {
  await dbDelete(id, db);
}
