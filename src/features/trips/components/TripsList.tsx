import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';

import { Button } from '@/ui/components';
import { Card } from '@/ui/components';
import { Sheet } from '@/ui/components';
import type { Trip } from '@/domain/trip';
import { listTripsAll } from '../queries';
import ReactCountryFlag from 'react-country-flag';
import {
  DISPLAY_STATUS_LABELS,
  getDisplayStatus,
  type DisplayStatus,
} from '../status';
import { StatusPill } from './StatusPill';

type Filter = DisplayStatus | 'all';
const FILTERS: Filter[] = ['all', 'planned', 'active', 'completed'];
const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  planned: DISPLAY_STATUS_LABELS.planned,
  active: DISPLAY_STATUS_LABELS.active,
  completed: DISPLAY_STATUS_LABELS.completed,
};

export interface TripsListProps {
  /** Called when the user clicks the "Edit" affordance. */
  onEdit: (trip: Trip) => void;
  /** Called when the user confirms deletion. */
  onDelete: (trip: Trip) => Promise<void> | void;
  /** Refresh tick — bump to re-fetch (e.g. after a create). */
  refreshKey?: number;
}

export function TripsList({
  onEdit,
  onDelete,
  refreshKey = 0,
}: TripsListProps): React.JSX.Element {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<Trip | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    return trips.filter((t) => getDisplayStatus(t) === filter);
  }, [trips, filter]);

  async function confirmDelete(): Promise<void> {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete);
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

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
              'rounded-full border px-3 py-1 text-xs transition-colors ' +
              (filter === f
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high')
            }
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading trips…</p>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-on-surface-variant" data-testid="trips-empty">
            No trips {filter !== 'all' ? `in "${FILTER_LABELS[filter]}"` : 'yet'}. Create your
            first one.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((trip) => {
            const codes = trip.country_codes ?? [];
            return (
              <li key={trip.id} data-testid={`trips-row-${trip.id}`}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-on-surface">
                          {codes.length > 0 && (
                            <span
                              className="mr-1.5 inline-flex gap-1"
                              aria-label={codes.join(', ')}
                              data-testid={`trips-flags-${trip.id}`}
                            >
                              {codes.map((c) => (
                                <ReactCountryFlag key={c} countryCode={c} svg />
                              ))}
                            </span>
                          )}
                          {trip.name}
                        </span>
                        <StatusPill trip={trip} />
                      </div>
                      <span className="text-xs text-on-surface-variant">
                        {trip.start_date} → {trip.end_date} · {trip.home_currency}
                      </span>
                      <span className="text-xs text-on-surface-variant opacity-60">
                        slug: {trip.slug}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEdit(trip)}
                        aria-label={`Edit ${trip.name}`}
                        title="Edit"
                        data-testid={`trips-edit-${trip.id}`}
                        className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(trip)}
                        aria-label={`Delete ${trip.name}`}
                        title="Delete"
                        data-testid={`trips-delete-${trip.id}`}
                        className="rounded-md p-1.5 text-red-500 hover:bg-red-500/10 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Sheet
        open={pendingDelete !== null}
        onClose={() => (deleting ? undefined : setPendingDelete(null))}
        side="bottom"
        title={pendingDelete ? `Delete "${pendingDelete.name}"?` : 'Delete trip?'}
      >
        <div className="flex flex-col gap-3" data-testid="trips-delete-confirm">
          <p className="text-sm text-on-surface">
            This removes the trip from this device. The corresponding markdown file in
            your Obsidian vault is <strong>not</strong> deleted — remove it there to
            fully clean up.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
              data-testid="trips-delete-cancel"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void confirmDelete()}
              disabled={deleting}
              data-testid="trips-delete-confirm-button"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
