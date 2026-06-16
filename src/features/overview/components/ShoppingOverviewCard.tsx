import { useLiveQuery } from 'dexie-react-hooks';
import { ShoppingBag } from 'lucide-react';
import type { Trip } from '@/domain/trip';
import { listShoppingItemsByTrip, listGeneralShoppingItems } from '@/features/shopping/queries';
import { OverviewCard } from './OverviewCard';

export function ShoppingOverviewCard({ trip }: { trip: Trip }): React.JSX.Element {
  const tripItems = useLiveQuery(() => listShoppingItemsByTrip(trip.id), [trip.id]);
  const generalItems = useLiveQuery(() => listGeneralShoppingItems(), []);
  const loading = tripItems === undefined || generalItems === undefined;

  const items = [...(tripItems ?? []), ...(generalItems ?? [])];
  const toBuy = items.filter((i) => !i.bought);
  const preview = toBuy.slice(0, 3);

  return (
    <OverviewCard to="/shopping" title="Shopping" icon={<ShoppingBag className="h-4 w-4" />} cta="Open shopping">
      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : items.length === 0 ? (
        <div className="flex h-full flex-col justify-center">
          <p className="text-sm font-medium text-on-surface">Nothing on the list yet</p>
          <p className="text-xs text-on-surface-variant">Add things to pick up for the trip.</p>
        </div>
      ) : toBuy.length === 0 ? (
        <div className="flex h-full flex-col justify-center">
          <p className="text-sm font-medium text-emerald-700">All bought ✓</p>
          <p className="text-xs text-on-surface-variant">{items.length} item{items.length === 1 ? '' : 's'} done.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold leading-none text-primary">{toBuy.length}</span>
            <span className="text-xs text-on-surface-variant">left to buy</span>
          </div>
          <ul className="flex flex-col gap-0.5">
            {preview.map((i) => (
              <li key={i.id} className="flex justify-between gap-2 text-xs">
                <span className="truncate text-on-surface-variant">{i.name}</span>
                {i.quantity !== undefined && (
                  <span className="shrink-0 text-on-surface-variant">×{i.quantity}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </OverviewCard>
  );
}
