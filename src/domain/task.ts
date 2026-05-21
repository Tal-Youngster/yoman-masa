import { z } from 'zod';
import { TaskId, TripId, newTaskId } from './ids';
import { IsoDate } from './dates';

export const TaskStatus = z.enum(['open', 'in_progress', 'done', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskPriority = z.enum(['highest', 'high', 'medium', 'low', 'lowest']);
export type TaskPriority = z.infer<typeof TaskPriority>;

/** Mirrors Obsidian Tasks plugin syntax. See ADR-0004. */
export const Task = z.object({
  type: z.literal('task'),
  id: TaskId,
  trip_id: TripId.nullable(),
  title: z.string().min(1),
  status: TaskStatus,
  priority: TaskPriority.optional(),
  due_date: IsoDate.optional(),
  scheduled_date: IsoDate.optional(),
  start_date: IsoDate.optional(),
  created_date: IsoDate.optional(),
  done_date: IsoDate.optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  /** Tokens on the source line that the parser didn't recognize — preserved verbatim on round-trip. */
  unknown_tokens: z.array(z.string()).default([]),
});
export type Task = z.infer<typeof Task>;

export type NewTaskInput = Omit<z.input<typeof Task>, 'id' | 'type'>;

export function newTask(input: NewTaskInput): Task {
  return Task.parse({ type: 'task', id: newTaskId(), ...input });
}
