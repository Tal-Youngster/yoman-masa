import { useState, useRef, useEffect, useMemo } from 'react';
import { Button, Input } from '@/ui/components';
import { todayIso, daysBetween } from '@/domain/dates';
import type { IsoDate } from '@/domain/dates';
import type { TaskPriority } from '@/domain/task';
import { parseQuickAdd, type QuickAddParse } from '../quick-parse';

export interface QuickAddTaskProps {
  /** Receives the parsed input — title plus any date/priority/tags lifted from the text. */
  onAdd: (parsed: QuickAddParse) => Promise<void>;
  placeholder?: string;
}

const PRIORITY_CHIP: Record<TaskPriority, { label: string; className: string }> = {
  highest: { label: 'P1', className: 'bg-red-500/10 text-red-600' },
  high: { label: 'P2', className: 'bg-orange-500/10 text-orange-600' },
  medium: { label: 'P3', className: 'bg-blue-500/10 text-blue-600' },
  low: { label: 'P4', className: 'bg-on-surface-variant/10 text-on-surface-variant' },
  lowest: { label: 'P5', className: 'bg-on-surface-variant/10 text-on-surface-variant' },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dueChipLabel(due: IsoDate, today: IsoDate): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  const [y, m, d] = due.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (diff > 1 && diff < 7) return WEEKDAYS[dt.getUTCDay()];
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]}`;
}

export function QuickAddTask({ onAdd, placeholder = 'Add a task' }: QuickAddTaskProps): React.JSX.Element {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const today = todayIso();
  const preview = useMemo(() => parseQuickAdd(title, today), [title, today]);
  const canSubmit = preview.title.length > 0 && !submitting;

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      await onAdd(preview);
      setTitle(''); // Reset but keep the row open so multiple tasks can be added in a row.
    } finally {
      setSubmitting(false);
    }
  }

  if (!isAdding) {
    return (
      <button
        type="button"
        onClick={() => setIsAdding(true)}
        className="group flex w-full items-center gap-2 py-2 text-sm text-on-surface-variant hover:text-primary transition-colors"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full text-primary group-hover:bg-primary group-hover:text-on-primary transition-colors">
          +
        </span>
        {placeholder}
      </button>
    );
  }

  const hasPreview = Boolean(preview.due_date || preview.priority || preview.tags.length > 0);

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-2 rounded-lg border border-outline-variant p-3 shadow-sm bg-surface">
      <Input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Book flights tomorrow p1 #travel"
        className="border-none bg-transparent p-0 shadow-none focus-visible:ring-0 text-sm font-medium"
        disabled={submitting}
      />

      {hasPreview && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {preview.due_date && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
              {dueChipLabel(preview.due_date, today)}
            </span>
          )}
          {preview.priority && (
            <span className={`rounded px-1.5 py-0.5 font-medium ${PRIORITY_CHIP[preview.priority].className}`}>
              {PRIORITY_CHIP[preview.priority].label}
            </span>
          )}
          {preview.tags.map((tag) => (
            <span key={tag} className="rounded bg-on-surface-variant/10 px-1.5 py-0.5 text-on-surface-variant">
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-2 border-t border-outline-variant pt-2">
        <span className="text-[11px] text-on-surface-variant">
          Type dates (tomorrow, fri), <span className="font-medium">p1–p4</span>, and #tags inline.
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setIsAdding(false);
              setTitle('');
            }}
            disabled={submitting}
            className="h-8 px-3 text-xs"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSubmit}
            className="h-8 px-3 text-xs bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? 'Adding...' : 'Add task'}
          </Button>
        </div>
      </div>
    </form>
  );
}
