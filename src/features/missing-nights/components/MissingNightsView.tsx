import { useMemo } from 'react';
import { Card } from '@/ui/components';
import { computeMissingNights, groupMissingGaps } from '../compute';
import type { Trip } from '@/domain/trip';
import type { Accommodation } from '@/domain/accommodation';

export interface MissingNightsViewProps {
  trip: Trip;
  accommodations: Accommodation[];
}

export function MissingNightsView({ trip, accommodations }: MissingNightsViewProps): React.JSX.Element {
  const gaps = useMemo(() => {
    const { missing } = computeMissingNights(trip, accommodations);
    return groupMissingGaps(missing);
  }, [trip, accommodations]);

  if (gaps.length === 0) {
    return (
      <Card>
        <p className="text-sm text-on-surface-variant">
          Fully covered! All {trip.start_date} to {trip.end_date} nights have booked accommodations.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Missing Nights" description="Gaps in your itinerary needing accommodations.">
      <ul className="flex flex-col gap-2 mt-2">
        {gaps.map((gap) => (
          <li key={gap.start} className="flex justify-between items-center rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm">
            <span className="font-semibold text-red-700 dark:text-red-400">
              {gap.start} → {gap.end_exclusive}
            </span>
            <span className="text-red-800 dark:text-red-300 font-medium bg-red-500/10 px-2 py-1 rounded">
              {gap.nights} night{gap.nights !== 1 ? 's' : ''}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
