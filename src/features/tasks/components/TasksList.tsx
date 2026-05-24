import type { Task } from '@/domain/task';
import { Button } from '@/ui/components';

export interface TasksListProps {
  tasks: Task[];
  today: string;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const PRIORITY_EMOJI: Record<string, string> = {
  highest: '🔺',
  high: '⏫',
  medium: '🔼',
  low: '🔽',
  lowest: '⏬',
};

function isComplete(t: Task): boolean {
  return t.status === 'done' || t.status === 'cancelled';
}

export function TasksList({ tasks, today, onToggle, onEdit, onDelete }: TasksListProps): React.JSX.Element {
  if (tasks.length === 0) {
    return <p className="text-sm text-on-surface-variant">No tasks yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {tasks.map((task) => {
        const done = isComplete(task);
        const overdue = !done && task.due_date !== undefined && task.due_date < today;
        return (
          <li
            key={task.id}
            className="flex items-start gap-3 rounded-lg border border-outline-variant p-3 text-sm"
          >
            <input
              type="checkbox"
              checked={task.status === 'done'}
              onChange={() => onToggle(task)}
              aria-label={task.status === 'done' ? 'Mark task open' : 'Mark task done'}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span
                className={
                  done ? 'text-on-surface-variant line-through' : 'font-medium text-on-surface'
                }
              >
                {task.priority ? `${PRIORITY_EMOJI[task.priority] ?? ''} ` : ''}
                {task.title}
              </span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-on-surface-variant">
                {task.due_date && (
                  <span className={overdue ? 'font-medium text-red-500' : ''}>
                    📅 {task.due_date}
                    {overdue ? ' (overdue)' : ''}
                  </span>
                )}
                {task.status === 'in_progress' && <span>in progress</span>}
                {task.status === 'cancelled' && <span>cancelled</span>}
                {task.tags.map((tag) => (
                  <span key={tag} className="text-primary">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" onClick={() => onEdit(task)} aria-label="Edit task">
                Edit
              </Button>
              <Button variant="ghost" onClick={() => onDelete(task)} aria-label="Delete task">
                ✕
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
