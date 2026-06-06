import { useCallback, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, Card, Sheet } from '@/ui/components';
import { useAppServices } from '@/app/use-app-services';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import type { ShoppingItem } from '@/domain/shopping-item';
import type { ShoppingScope } from '../shopping-admin';
import { ShoppingForm } from './ShoppingForm';
import { ShoppingList } from './ShoppingList';

type DialogMode = 'none' | 'create' | 'edit';
type ScopeKind = 'trip' | 'general';

const GENERAL_SCOPE: ShoppingScope = { tripId: null, slug: null };
const FALLBACK_CURRENCY = 'USD';

export function ShoppingRoute(): React.JSX.Element {
  const { shoppingAdmin } = useAppServices();
  const { activeTrip, loading } = useActiveTrip();

  const [scopeKind, setScopeKind] = useState<ScopeKind>('trip');
  const [dialog, setDialog] = useState<DialogMode>('none');
  const [editing, setEditing] = useState<ShoppingItem | null>(null);

  // No active trip → there's nothing but the General list to show.
  const effectiveKind: ScopeKind = activeTrip ? scopeKind : 'general';
  const scope: ShoppingScope = useMemo(
    () =>
      effectiveKind === 'trip' && activeTrip
        ? { tripId: activeTrip.id, slug: activeTrip.slug }
        : GENERAL_SCOPE,
    [effectiveKind, activeTrip],
  );

  // Subscribes to the `shopping_items` table — covers local mutations and
  // inbound pulls without manual refresh-key bookkeeping.
  const items =
    useLiveQuery<ShoppingItem[]>(
      () => (shoppingAdmin ? shoppingAdmin.listByScope(scope) : Promise.resolve([])),
      [shoppingAdmin, scope.tripId],
    ) ?? [];

  const defaultCurrency = activeTrip?.home_currency ?? FALLBACK_CURRENCY;

  const openCreate = useCallback(() => {
    setEditing(null);
    setDialog('create');
  }, []);

  const openEdit = useCallback((s: ShoppingItem) => {
    setEditing(s);
    setDialog('edit');
  }, []);

  const handleToggle = useCallback(
    async (s: ShoppingItem) => {
      if (!shoppingAdmin) return;
      await shoppingAdmin.setBought(scope, s, !s.bought);
    },
    [shoppingAdmin, scope],
  );

  const handleDelete = useCallback(
    async (s: ShoppingItem) => {
      if (!shoppingAdmin) return;
      if (!confirm(`Delete "${s.name}"?`)) return;
      await shoppingAdmin.removeItem(scope, s);
    },
    [shoppingAdmin, scope],
  );

  const handleSuccess = useCallback(() => {
    setDialog('none');
    setEditing(null);
  }, []);

  if (loading) {
    return <p className="text-sm text-on-surface-variant">Loading…</p>;
  }

  if (!shoppingAdmin) {
    return (
      <Card title="Shopping" description="Per-trip and General shopping lists.">
        <p className="text-sm text-on-surface-variant">Shopping service is not configured.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">Shopping</h2>
          <p className="text-xs text-on-surface-variant">
            {effectiveKind === 'trip' && activeTrip
              ? `Shopping for ${activeTrip.name}.`
              : 'Cross-trip General shopping.'}
          </p>
        </div>
        <Button onClick={openCreate} aria-label="New item">
          +
        </Button>
      </div>

      {activeTrip && (
        <div className="flex gap-6 border-b border-outline-variant text-sm mb-2">
          <button
            type="button"
            onClick={() => setScopeKind('trip')}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              effectiveKind === 'trip'
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {activeTrip.name}
          </button>
          <button
            type="button"
            onClick={() => setScopeKind('general')}
            className={`pb-2 px-1 border-b-2 transition-colors ${
              effectiveKind === 'general'
                ? 'border-primary text-primary font-medium'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            General
          </button>
        </div>
      )}

      <ShoppingList
        items={items}
        onToggle={(s) => void handleToggle(s)}
        onEdit={openEdit}
        onDelete={(s) => void handleDelete(s)}
      />

      <Sheet
        open={dialog !== 'none'}
        onClose={() => setDialog('none')}
        side="bottom"
        title={dialog === 'edit' ? 'Edit item' : 'New item'}
      >
        {dialog !== 'none' && (
          <ShoppingForm
            scope={scope}
            admin={shoppingAdmin}
            defaultCurrency={defaultCurrency}
            {...(editing ? { item: editing } : {})}
            onSuccess={handleSuccess}
            onCancel={() => setDialog('none')}
          />
        )}
      </Sheet>
    </div>
  );
}
