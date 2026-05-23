import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/ui/components';
import { Card } from '@/ui/components';
import type { Trip, TripStatus } from '@/domain/trip';
import { listTripsAll } from '../queries';

type Filter = TripStatus | 'all';
const FILTERS: Filter[] = ['planned', 'active', 'completed', 'archived', 'all'];

export interface TripsListProps {
  /** Active trip id from kv; rows highlight when matching. */
  activeTripId: string | null;
  /** Called when the user clicks "Set active" on a row. */
  onSetActive: (tripId: string) => Promise<void> | void;
  /** Called when the user clicks the "Edit" affordance. */
  onEdit: (trip: Trip) => void;
  /** Refresh tick — bump to re-fetch (e.g. after a create). */
  refreshKey?: number;
}

export function TripsList({
  activeTripId,
  onSetActive,
  onEdit,
  refreshKey = 0,
}: TripsListProps): React.JSX.Element {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const all = await listTripsAll();
      if (cancelled) return;
      setTrips(all);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const filtered = useMemo(() => {
    if (filter === 'all') return trips;
    return trips.filter((t) => t.status === filter);
  }, [trips, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            data-testid={`trips-filter-${f}`}
            className={
              'rounded-full border px-3 py-1 text-xs ' +
              (filter === f
                ? 'border-sky-400 bg-sky-500/10 text-sky-200'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800/60')
            }
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Loading trips…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-300" data-testid="trips-empty">
            No trips {filter !== 'all' ? `with status "${filter}"` : 'yet'}. Create your first one.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((trip) => {
            const isActive = trip.id === activeTripId;
            return (
              <li key={trip.id} data-testid={`trips-row-${trip.id}`}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-100">
                        {trip.name}
                        {isActive && (
                          <span
                            className="ml-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-xs text-sky-200"
                            data-testid={`trips-active-badge-${trip.id}`}
                          >
                            active
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-slate-400">
                        {trip.start_date} → {trip.end_date} · {trip.status} · {trip.home_currency}
                      </span>
                      <span className="text-xs text-slate-500">slug: {trip.slug}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onEdit(trip)}
                        data-testid={`trips-edit-${trip.id}`}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant={isActive ? 'ghost' : 'secondary'}
                        disabled={isActive}
                        onClick={() => void onSetActive(trip.id)}
                        data-testid={`trips-set-active-${trip.id}`}
                      >
                        {isActive ? 'Active' : 'Set active'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
