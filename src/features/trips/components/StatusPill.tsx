import {
  DISPLAY_STATUS_LABELS,
  getDisplayStatus,
  type DisplayStatus,
} from '../status';

export interface StatusPillProps {
  trip: { start_date: string; end_date: string };
  /** Override `today` for tests / storybook. */
  today?: string;
  className?: string;
}

const PILL_CLASSES: Record<DisplayStatus, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/40',
  planned: 'bg-sky-500/15 text-sky-700 border-sky-500/40',
  completed: 'bg-zinc-400/15 text-zinc-600 border-zinc-400/50',
};

export function StatusPill({ trip, today, className }: StatusPillProps): React.JSX.Element {
  const status = getDisplayStatus(trip, today);
  const base =
    'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium leading-none';
  return (
    <span
      className={`${base} ${PILL_CLASSES[status]} ${className ?? ''}`.trim()}
      data-testid={`trip-status-pill-${status}`}
      data-status={status}
    >
      {DISPLAY_STATUS_LABELS[status]}
    </span>
  );
}
