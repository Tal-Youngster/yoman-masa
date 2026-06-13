import { useLiveQuery } from 'dexie-react-hooks';
import { BedDouble } from 'lucide-react';
import type { Trip } from '@/domain/trip';
import { listAccommodationsByTrip } from '@/features/accommodations/queries';
import { computeMissingNights, groupMissingGaps } from '@/features/missing-nights/compute';
import { OverviewCard } from './OverviewCard';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function MissingNightOverviewCard({ trip }: { trip: Trip }): React.JSX.Element {
  const accommodations = useLiveQuery(() => listAccommodationsByTrip(trip.id), [trip.id]);
  const loading = accommodations === undefined;

  const today = todayIso();
  const missing = accommodations ? computeMissingNights(trip, accommodations).missing : [];
  const gaps = groupMissingGaps(missing).filter((g) => g.start >= today);
  const next = gaps[0];
  const daysUntil = next
    ? Math.max(0, Math.round((Date.parse(`${next.start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000))
    : null;

  return (
    <OverviewCard
      to="/accommodations"
      title="Missing nights"
      icon={<BedDouble className="h-4 w-4" />}
      cta="Open accommodations"
    >
      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : daysUntil === null ? (
        <div className="flex h-full flex-col justify-center">
          <p className="text-sm font-medium text-emerald-700">You're fully covered 🎉</p>
          <p className="text-xs text-on-surface-variant">No upcoming accommodation gaps.</p>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold leading-none text-primary">{daysUntil}</span>
          <div className="pb-0.5">
            <p className="text-sm font-medium text-on-surface">days until a gap</p>
            <p className="text-xs text-on-surface-variant">
              from {next?.start} · {gaps.length} gap{gaps.length === 1 ? '' : 's'} ahead
            </p>
          </div>
        </div>
      )}
    </OverviewCard>
  );
}
