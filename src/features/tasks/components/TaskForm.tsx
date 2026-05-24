import { useState, type FormEvent } from 'react';
import { Button, Input } from '@/ui/components';
import { IsoDate } from '@/domain/dates';
import { TaskStatus, TaskPriority, Task } from '@/domain/task';
import type { AddTaskInput, TaskScope, TasksAdminService } from '../tasks-admin';

export interface TaskFormProps {
  scope: TaskScope;
  admin: TasksAdminService;
  /** Pass to edit an existing task; omit to create. */
  task?: Task;
  onSuccess: () => void;
  onCancel: () => void;
}

const STATUSES = TaskStatus.options;
const PRIORITIES = TaskPriority.options;

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

export function TaskForm({ scope, admin, task, onSuccess, onCancel }: TaskFormProps): React.JSX.Element {
  const editing = task !== undefined;
  const [title, setTitle] = useState(task?.title ?? '');
  const [status, setStatus] = useState<string>(task?.status ?? 'open');
  const [priority, setPriority] = useState<string>(task?.priority ?? '');
  const [dueDate, setDueDate] = useState(task?.due_date ?? '');
  const [scheduledDate, setScheduledDate] = useState(task?.scheduled_date ?? '');
  const [startDate, setStartDate] = useState(task?.start_date ?? '');
  const [tags, setTags] = useState((task?.tags ?? []).join(', '));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim() === '') {
      setError('Title is required');
      return;
    }
    let due: IsoDate | undefined;
    let scheduled: IsoDate | undefined;
    let start: IsoDate | undefined;
    try {
      due = dueDate ? IsoDate.parse(dueDate) : undefined;
      scheduled = scheduledDate ? IsoDate.parse(scheduledDate) : undefined;
      start = startDate ? IsoDate.parse(startDate) : undefined;
    } catch {
      setError('Dates must be valid calendar dates');
      return;
    }
    const tagList = tags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => t.length > 0);

    setSubmitting(true);
    try {
      if (editing && task) {
        // Rebuild from the always-present fields so clearing a date/priority
        // actually drops it (a spread would keep the stale value, and setting
        // it to `undefined` violates exactOptionalPropertyTypes).
        const updated = Task.parse({
          type: 'task',
          id: task.id,
          trip_id: task.trip_id,
          title: title.trim(),
          status: TaskStatus.parse(status),
          tags: tagList,
          unknown_tokens: task.unknown_tokens,
          ...(task.created_date ? { created_date: task.created_date } : {}),
          ...(task.done_date ? { done_date: task.done_date } : {}),
          ...(priority ? { priority: TaskPriority.parse(priority) } : {}),
          ...(due ? { due_date: due } : {}),
          ...(scheduled ? { scheduled_date: scheduled } : {}),
          ...(start ? { start_date: start } : {}),
        });
        await admin.updateTask(scope, updated);
      } else {
        const input: AddTaskInput = {
          title: title.trim(),
          status: TaskStatus.parse(status),
          tags: tagList,
          ...(priority ? { priority: TaskPriority.parse(priority) } : {}),
          ...(due ? { due_date: due } : {}),
          ...(scheduled ? { scheduled_date: scheduled } : {}),
          ...(start ? { start_date: start } : {}),
        };
        await admin.addTask(scope, input);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-on-surface-variant">Title</span>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Book Vietnam flights" required />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-outline bg-surface px-3 py-2 text-sm text-on-surface"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Priority</span>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="rounded-md border border-outline bg-surface px-3 py-2 text-sm text-on-surface"
          >
            <option value="">None</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-on-surface-variant">Due date</span>
        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Scheduled</span>
          <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-on-surface-variant">Start</span>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-on-surface-variant">Tags (comma-separated)</span>
        <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="travel/flights, admin" />
      </label>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel} variant="ghost">
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : editing ? 'Save' : 'Add task'}
        </Button>
      </div>
    </form>
  );
}
