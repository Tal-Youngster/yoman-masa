import { useEffect, useState } from 'react';
import { Card } from '@/ui/components';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import type { Task } from '@/domain/task';
import { listTasksByTrip, listGeneralTasks } from '../queries';

const HORIZON_DAYS = 14;

function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoPlusDays(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

function isOpen(t: Task): boolean {
  return t.status === 'open' || t.status === 'in_progress';
}

export function TasksDashboardCard(): React.JSX.Element {
  const { activeTrip, loading: tripLoading } = useActiveTrip();
  const [loading, setLoading] = useState(true);
  const [overdue, setOverdue] = useState<Task[]>([]);
  const [dueSoon, setDueSoon] = useState<Task[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [tripTasks, generalTasks] = await Promise.all([
        activeTrip ? listTasksByTrip(activeTrip.id) : Promise.resolve<Task[]>([]),
        listGeneralTasks(),
      ]);
      if (cancelled) return;
      const today = todayIsoLocal();
      const horizon = isoPlusDays(HORIZON_DAYS);
      const withDue = [...tripTasks, ...generalTasks].filter(
        (t) => isOpen(t) && t.due_date !== undefined,
      );
      const byDue = (a: Task, b: Task) => (a.due_date as string).localeCompare(b.due_date as string);
      setOverdue(withDue.filter((t) => (t.due_date as string) < today).sort(byDue));
      setDueSoon(
        withDue
          .filter((t) => (t.due_date as string) >= today && (t.due_date as string) <= horizon)
          .sort(byDue),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTrip]);

  if (tripLoading || loading) {
    return (
      <Card title="Tasks" description="Overdue and upcoming.">
        <p className="text-sm text-on-surface-variant">Loading…</p>
      </Card>
    );
  }

  if (overdue.length === 0 && dueSoon.length === 0) {
    return (
      <Card title="Tasks" description="Overdue and upcoming.">
        <p className="text-sm text-on-surface-variant">Nothing due in the next {HORIZON_DAYS} days.</p>
      </Card>
    );
  }

  return (
    <Card title="Tasks" description="Overdue and upcoming.">
      <div className="flex flex-col gap-3">
        {overdue.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-red-500">Overdue</span>
            {overdue.map((t) => (
              <TaskRow key={t.id} task={t} accent="text-red-500" />
            ))}
          </div>
        )}
        {dueSoon.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase text-on-surface-variant">
              Next {HORIZON_DAYS} days
            </span>
            {dueSoon.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function TaskRow({ task, accent }: { task: Task; accent?: string }): React.JSX.Element {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="truncate text-on-surface">{task.title}</span>
      <span className={`shrink-0 ${accent ?? 'text-on-surface-variant'}`}>{task.due_date}</span>
    </div>
  );
}
