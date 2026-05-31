import { useEffect, useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Sheet, Card } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import type { Expense } from '@/domain/expense';
import { ExpenseForm } from './ExpenseForm';
import { ExpensesList } from './ExpensesList';
import { ExpenseSummaries } from './ExpenseSummaries';
import { readCachedRates, type RatesSnapshot } from '@/lib/currency';

type DialogMode = 'none' | 'create' | 'edit';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ExpensesRoute(): React.JSX.Element {
  const { expensesAdmin } = useAppServices();
  const { activeTrip, loading } = useActiveTrip();

  const [dialog, setDialog] = useState<DialogMode>('none');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [snapshot, setSnapshot] = useState<RatesSnapshot | undefined>(undefined);

  const today = todayIso();

  // Subscribes to the `expenses` table — local mutations and inbound pulls
  // re-render automatically. Empty array while we still have no trip/admin.
  const expenses = useLiveQuery<Expense[]>(
    () =>
      activeTrip && expensesAdmin
        ? expensesAdmin.listByTrip(activeTrip.id)
        : Promise.resolve([]),
    [activeTrip?.id, expensesAdmin],
  ) ?? [];

  // FX snapshot is a one-shot read from the rates cache (not Dexie-backed), so
  // a plain effect is fine. Refreshes when the trip changes in case a cache
  // populate raced the first render.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const snap = await readCachedRates();
      if (!cancelled) setSnapshot(snap ?? undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTrip?.id]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setDialog('create');
  }, []);

  const openEdit = useCallback((e: Expense) => {
    setEditing(e);
    setDialog('edit');
  }, []);

  // useLiveQuery re-renders on the Dexie write — no manual refresh-key bump.
  const handleDelete = useCallback(
    async (e: Expense) => {
      if (!activeTrip || !expensesAdmin) return;
      if (!confirm(`Delete expense "${e.description || e.id}"?`)) return;
      await expensesAdmin.removeExpense(activeTrip, e);
    },
    [activeTrip, expensesAdmin],
  );

  const handleSuccess = useCallback(() => {
    setDialog('none');
    setEditing(null);
  }, []);

  if (loading) {
    return <p className="text-sm text-on-surface-variant">Loading…</p>;
  }

  if (!activeTrip) {
    return (
      <Card title="Expenses" description="Multi-currency spending.">
        <p className="text-sm text-on-surface-variant">
          Set an active trip first in the Trips tab.
        </p>
      </Card>
    );
  }

  if (!expensesAdmin) {
    return (
      <Card title="Expenses" description="Multi-currency spending.">
        <p className="text-sm text-on-surface-variant">
          Expenses service is not configured.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Expenses</h2>
          <p className="text-xs text-on-surface-variant">
            Tracking spending for {activeTrip.name}.
          </p>
        </div>
        <Button onClick={openCreate} aria-label="New expense">+</Button>
      </div>

      <ExpenseSummaries expenses={expenses} homeCurrency={activeTrip.home_currency} />

      <ExpensesList
        expenses={expenses}
        today={today}
        {...(snapshot ? { ratesSnapshot: snapshot } : {})}
        onEdit={openEdit}
        onDelete={(e) => void handleDelete(e)}
      />

      <Sheet
        open={dialog !== 'none'}
        onClose={() => setDialog('none')}
        side="bottom"
        title={dialog === 'edit' ? `Edit expense` : 'New expense'}
      >
        {dialog !== 'none' && (
          <ExpenseForm
            trip={activeTrip}
            admin={expensesAdmin}
            {...(editing ? { expense: editing } : {})}
            onSuccess={handleSuccess}
            onCancel={() => setDialog('none')}
          />
        )}
      </Sheet>
    </div>
  );
}
