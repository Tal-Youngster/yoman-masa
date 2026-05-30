import { useState } from 'react';
import type { Task } from '@/domain/task';
import { Button } from '@/ui/components';

export interface TaskRowProps {
  task: Task;
  today: string;
  onToggle: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  highest: 'border-red-500',
  high: 'border-orange-500',
  medium: 'border-blue-500',
  low: 'border-on-surface-variant',
  lowest: 'border-on-surface-variant',
};

const PRIORITY_BG: Record<string, string> = {
  highest: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-blue-500',
  low: 'bg-on-surface-variant',
  lowest: 'bg-on-surface-variant',
};

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function isComplete(t: Task): boolean {
  return t.status === 'done' || t.status === 'cancelled';
}

function formatFriendlyDate(dateStr: string | undefined, today: string): { text: string; color: string } | null {
  if (!dateStr) return null;
  const dateObj = new Date(dateStr);
  const todayObj = new Date(today);
  const diffTime = dateObj.getTime() - todayObj.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { text: `${Math.abs(diffDays)}d overdue`, color: 'text-red-500 font-medium' };
  } else if (diffDays === 0) {
    return { text: 'Today', color: 'text-green-600 font-medium' };
  } else if (diffDays === 1) {
    return { text: 'Tomorrow', color: 'text-orange-500' };
  } else if (diffDays < 7) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return { text: days[dateObj.getDay()] || dateStr, color: 'text-primary' };
  } else {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { text: `${dateObj.getDate()} ${months[dateObj.getMonth()]}`, color: 'text-on-surface-variant' };
  }
}

export function TaskRow({ task, today, onToggle, onEdit, onDelete }: TaskRowProps): React.JSX.Element {
  const [hover, setHover] = useState(false);
  const done = isComplete(task);
  const pColor = task.priority && !done ? PRIORITY_COLORS[task.priority] || 'border-on-surface-variant' : 'border-on-surface-variant';
  const pBg = task.priority ? PRIORITY_BG[task.priority] || 'bg-on-surface-variant' : 'bg-on-surface-variant';

  const dateDisplay = formatFriendlyDate(task.due_date, today);

  return (
    <div
      className="group flex items-start gap-3 border-b border-outline-variant py-2.5 last:border-0 hover:bg-surface-variant/30"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => onToggle(task)}
        aria-label={done ? 'Mark task open' : 'Mark task done'}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          done ? `${pBg} border-transparent text-white` : `${pColor} hover:bg-on-surface/5 bg-transparent`
        }`}
      >
        {done && <CheckIcon className="h-3 w-3 text-white" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`text-sm ${
            done ? 'text-on-surface-variant line-through' : 'font-medium text-on-surface'
          }`}
        >
          {task.title}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {dateDisplay && (
            <span className={done ? 'text-on-surface-variant line-through' : dateDisplay.color}>
              {dateDisplay.text}
            </span>
          )}
          {task.status === 'in_progress' && <span className="text-on-surface-variant">in progress</span>}
          {task.status === 'cancelled' && <span className="text-on-surface-variant">cancelled</span>}
          {!done && task.tags.map((tag) => (
            <span key={tag} className="text-on-surface-variant">
              #{tag}
            </span>
          ))}
        </div>
      </div>

      <div
        className={`flex shrink-0 gap-1 transition-opacity ${
          hover ? 'opacity-100' : 'opacity-0 md:opacity-0 max-md:opacity-100'
        }`}
      >
        <Button variant="ghost" onClick={() => onEdit(task)} aria-label="Edit task" className="h-8 px-2 py-1 text-xs">
          Edit
        </Button>
        <Button variant="ghost" onClick={() => onDelete(task)} aria-label="Delete task" className="h-8 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10 hover:text-red-600">
          ✕
        </Button>
      </div>
    </div>
  );
}
