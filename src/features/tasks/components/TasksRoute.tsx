import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Sheet } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import { todayIso } from '@/domain/dates';
import type { Task } from '@/domain/task';
import type { TaskScope } from '../tasks-admin';
import { TaskForm } from './TaskForm';
import { TasksList } from './TasksList';

type DialogMode = 'none' | 'create' | 'edit';
type ScopeKind = 'trip' | 'general';

const GENERAL_SCOPE: TaskScope = { tripId: null, slug: null };

export function TasksRoute(): React.JSX.Element {
  const { tasksAdmin } = useAppServices();
  const { activeTrip, loading } = useActiveTrip();

  const [scopeKind, setScopeKind] = useState<ScopeKind>('trip');
  const [dialog, setDialog] = useState<DialogMode>('none');
  const [editing, setEditing] = useState<Task | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const today = todayIso();

  // No active trip → there's nothing but the General list to show.
  const effectiveKind: ScopeKind = activeTrip ? scopeKind : 'general';
  const scope: TaskScope = useMemo(
    () =>
      effectiveKind === 'trip' && activeTrip
        ? { tripId: activeTrip.id, slug: activeTrip.slug }
        : GENERAL_SCOPE,
    [effectiveKind, activeTrip],
  );

  useEffect(() => {
    if (!tasksAdmin) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const list = await tasksAdmin.listByScope(scope);
      if (!cancelled) setTasks(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [tasksAdmin, scope, refreshKey]);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);

  const openCreate = useCallback(() => {
    setEditing(null);
    setDialog('create');
  }, []);

  const openEdit = useCallback((t: Task) => {
    setEditing(t);
    setDialog('edit');
  }, []);

  const handleToggle = useCallback(
    async (t: Task) => {
      if (!tasksAdmin) return;
      await tasksAdmin.setStatus(scope, t, t.status === 'done' ? 'open' : 'done');
      reload();
    },
    [tasksAdmin, scope, reload],
  );

  const handleDelete = useCallback(
    async (t: Task) => {
      if (!tasksAdmin) return;
      if (!confirm(`Delete task "${t.title}"?`)) return;
      await tasksAdmin.removeTask(scope, t);
      reload();
    },
    [tasksAdmin, scope, reload],
  );

  const handleSuccess = useCallback(() => {
    setDialog('none');
    setEditing(null);
    reload();
  }, [reload]);

  if (loading) {
    return <p className="text-sm text-on-surface-variant">Loading…</p>;
  }

  if (!tasksAdmin) {
    return (
      <Card title="Tasks" description="Trip tasks plus a General bucket.">
        <p className="text-sm text-on-surface-variant">Tasks service is not configured.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Tasks</h2>
          <p className="text-xs text-on-surface-variant">
            {effectiveKind === 'trip' && activeTrip
              ? `Tasks for ${activeTrip.name}.`
              : 'Cross-trip General tasks.'}
          </p>
        </div>
        <Button onClick={openCreate} aria-label="New task">
          +
        </Button>
      </div>

      {activeTrip && (
        <div className="flex gap-1 rounded-lg border border-outline-variant p-1 text-sm">
          <button
            type="button"
            onClick={() => setScopeKind('trip')}
            className={`flex-1 rounded-md px-3 py-1.5 ${
              effectiveKind === 'trip' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
            }`}
          >
            {activeTrip.name}
          </button>
          <button
            type="button"
            onClick={() => setScopeKind('general')}
            className={`flex-1 rounded-md px-3 py-1.5 ${
              effectiveKind === 'general' ? 'bg-primary text-on-primary' : 'text-on-surface-variant'
            }`}
          >
            General
          </button>
        </div>
      )}

      <TasksList
        tasks={tasks}
        today={today}
        onToggle={(t) => void handleToggle(t)}
        onEdit={openEdit}
        onDelete={(t) => void handleDelete(t)}
      />

      <Sheet
        open={dialog !== 'none'}
        onClose={() => setDialog('none')}
        side="bottom"
        title={dialog === 'edit' ? 'Edit task' : 'New task'}
      >
        {dialog !== 'none' && (
          <TaskForm
            scope={scope}
            admin={tasksAdmin}
            {...(editing ? { task: editing } : {})}
            onSuccess={handleSuccess}
            onCancel={() => setDialog('none')}
          />
        )}
      </Sheet>
    </div>
  );
}
