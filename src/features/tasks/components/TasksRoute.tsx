import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Sheet } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import { todayIso } from '@/domain/dates';
import type { Task } from '@/domain/task';
import type { TaskScope } from '../tasks-admin';
import type { QuickAddParse } from '../quick-parse';
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

  const handleQuickAdd = useCallback(async (parsed: QuickAddParse) => {
    if (!tasksAdmin || parsed.title === '') return;
    await tasksAdmin.addTask(scope, {
      title: parsed.title,
      status: 'open',
      tags: parsed.tags,
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(parsed.due_date ? { due_date: parsed.due_date } : {}),
    });
    reload();
  }, [tasksAdmin, scope, reload]);

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
        <div className="flex gap-6 border-b border-outline-variant text-sm mb-2">
          <button
            type="button"
            onClick={() => setScopeKind('trip')}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              effectiveKind === 'trip' ? 'border-primary text-primary font-medium' : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {activeTrip.name}
          </button>
          <button
            type="button"
            onClick={() => setScopeKind('general')}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              effectiveKind === 'general' ? 'border-primary text-primary font-medium' : 'border-transparent text-on-surface-variant hover:text-on-surface'
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
        onQuickAdd={handleQuickAdd}
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
