import { useEffect, useState } from 'react';
import { Card } from '@/ui/components';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import { listAccommodationsByTrip } from '@/features/accommodations/queries';
import { computeMissingNights, groupMissingGaps, type MissingGap } from '../compute';

export function MissingNightsDashboardCard(): React.JSX.Element {
  const { activeTrip, loading: tripLoading } = useActiveTrip();
  const [loadingAccs, setLoadingAccs] = useState(true);
  const [gaps, setGaps] = useState<MissingGap[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!activeTrip) {
      setGaps([]);
      setLoadingAccs(false);
      return;
    }
    setLoadingAccs(true);
    void (async () => {
      const accommodations = await listAccommodationsByTrip(activeTrip.id);
      if (cancelled) return;
      const { missing } = computeMissingNights(activeTrip, accommodations);
      const allGaps = groupMissingGaps(missing);
      const today = new Date().toISOString().split('T')[0];
      const next30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const upcomingGaps = allGaps.filter((g) => g.start >= today && g.start <= next30Days);
      setGaps(upcomingGaps);
      setLoadingAccs(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTrip]);

  if (tripLoading || loadingAccs) {
    return (
      <Card title="Missing Nights" description="Upcoming accommodation gaps.">
        <p className="text-sm text-on-surface-variant">Loading...</p>
      </Card>
    );
  }

  if (!activeTrip) {
    return (
      <Card title="Missing Nights" description="Upcoming accommodation gaps.">
        <p className="text-sm text-on-surface-variant">No active trip.</p>
      </Card>
    );
  }

  return (
    <Card title="Missing Nights" description={`Upcoming gaps for ${activeTrip.name}.`}>
      {gaps.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No gaps in the next 30 days. You're covered!</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {gaps.map((gap) => (
            <li key={gap.start} className="flex justify-between rounded-lg border border-outline-variant p-2 text-sm">
              <span className="font-medium text-on-surface">{gap.start} to {gap.end_exclusive}</span>
              <span className="text-on-surface-variant">{gap.nights} night{gap.nights !== 1 ? 's' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
