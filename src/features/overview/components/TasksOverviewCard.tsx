import { useLiveQuery } from 'dexie-react-hooks';
import { CheckSquare } from 'lucide-react';
import type { Trip } from '@/domain/trip';
import type { Task } from '@/domain/task';
import { listTasksByTrip, listGeneralTasks } from '@/features/tasks/queries';
import { OverviewCard } from './OverviewCard';

const HORIZON_DAYS = 14;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function isoPlusDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().split('T')[0];
}
function isOpen(t: Task): boolean {
  return t.status === 'open' || t.status === 'in_progress';
}

export function TasksOverviewCard({ trip }: { trip: Trip }): React.JSX.Element {
  const tripTasks = useLiveQuery(() => listTasksByTrip(trip.id), [trip.id]);
  const generalTasks = useLiveQuery(() => listGeneralTasks(), []);
  const loading = tripTasks === undefined || generalTasks === undefined;

  const today = todayIso();
  const horizon = isoPlusDays(HORIZON_DAYS);
  const withDue = [...(tripTasks ?? []), ...(generalTasks ?? [])].filter(
    (t) => isOpen(t) && t.due_date !== undefined,
  );
  const overdue = withDue.filter((t) => (t.due_date as string) < today);
  const dueSoon = withDue.filter(
    (t) => (t.due_date as string) >= today && (t.due_date as string) <= horizon,
  );
  const preview = [...overdue, ...dueSoon]
    .sort((a, b) => (a.due_date as string).localeCompare(b.due_date as string))
    .slice(0, 3);

  return (
    <OverviewCard to="/tasks" title="Tasks" icon={<CheckSquare className="h-4 w-4" />} cta="Open tasks">
      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : overdue.length === 0 && dueSoon.length === 0 ? (
        <div className="flex h-full flex-col justify-center">
          <p className="text-sm font-medium text-on-surface">All caught up</p>
          <p className="text-xs text-on-surface-variant">Nothing due in the next {HORIZON_DAYS} days.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-4">
            {overdue.length > 0 && (
              <Stat n={overdue.length} label="overdue" tone="text-red-600" />
            )}
            <Stat n={dueSoon.length} label="due soon" tone="text-on-surface" />
          </div>
          <ul className="flex flex-col gap-0.5">
            {preview.map((t) => (
              <li key={t.id} className="flex justify-between gap-2 text-xs">
                <span className="truncate text-on-surface-variant">{t.title}</span>
                <span
                  className={`shrink-0 ${(t.due_date as string) < today ? 'text-red-600' : 'text-on-surface-variant'}`}
                >
                  {t.due_date}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </OverviewCard>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-1">
      <span className={`text-2xl font-bold leading-none ${tone}`}>{n}</span>
      <span className="text-xs text-on-surface-variant">{label}</span>
    </div>
  );
}
