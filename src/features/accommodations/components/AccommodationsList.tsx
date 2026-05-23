import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/ui/components';
import type { Accommodation, AccommodationStatus } from '@/domain/accommodation';
import type { TripId } from '@/domain/ids';
import { listAccommodationsByTrip } from '../queries';

type Filter = AccommodationStatus | 'all';
const FILTERS: Filter[] = ['booked', 'wishlist', 'cancelled', 'all'];

export interface AccommodationsListProps {
  tripId: TripId;
  onView: (acc: Accommodation) => void;
  onEdit: (acc: Accommodation) => void;
  refreshKey?: number;
  onDataLoaded?: (accs: Accommodation[]) => void;
}

export function AccommodationsList({ tripId, onView, onEdit, refreshKey = 0, onDataLoaded }: AccommodationsListProps): React.JSX.Element {
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const all = await listAccommodationsByTrip(tripId);
      if (cancelled) return;
      setAccommodations(all);
      onDataLoaded?.(all);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId, refreshKey, onDataLoaded]);

  const filtered = useMemo(() => {
    if (filter === 'all') return accommodations;
    return accommodations.filter(a => a.status === filter);
  }, [accommodations, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="tablist">
        {FILTERS.map(f => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === f
                ? 'border-primary bg-primary/10 text-primary font-medium'
                : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading accommodations...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="text-sm text-on-surface-variant">
            No accommodations {filter !== 'all' ? `with status "${filter}"` : 'found'}.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map(acc => (
            <li key={acc.id}>
              <Card 
                className="cursor-pointer hover:bg-surface-container-high transition-colors"
                onClick={() => onView(acc)}
              >
                <div className="flex justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-on-surface">{acc.name}</span>
                    <span className="text-xs text-on-surface-variant">
                      {acc.checkin} → {acc.checkout}
                    </span>
                    <span className="text-xs text-on-surface-variant">
                      {acc.service === 'other' ? acc.service_other_label : acc.service} • {acc.status}
                    </span>
                    {acc.location && (
                      <span className="text-xs text-on-surface-variant truncate">
                        {acc.location.address}
                      </span>
                    )}
                  </div>
                  <div className="flex items-start gap-1">
                    {acc.url && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); window.open(acc.url, '_blank'); }}
                        title="Open URL"
                        className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEdit(acc); }}
                      title="Edit"
                      className="rounded-md p-1.5 text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
