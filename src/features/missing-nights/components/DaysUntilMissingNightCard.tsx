import { useEffect, useState } from 'react';
import { Card } from '@/ui/components';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import { listAccommodationsByTrip } from '@/features/accommodations/queries';
import { computeMissingNights, groupMissingGaps } from '../compute';

export function DaysUntilMissingNightCard(): React.JSX.Element {
  const { activeTrip, loading: tripLoading } = useActiveTrip();
  const [loadingAccs, setLoadingAccs] = useState(true);
  const [daysUntil, setDaysUntil] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!activeTrip) {
      setDaysUntil(null);
      setLoadingAccs(false);
      return;
    }
    setLoadingAccs(true);
    void (async () => {
      const accommodations = await listAccommodationsByTrip(activeTrip.id);
      if (cancelled) return;
      const { missing } = computeMissingNights(activeTrip, accommodations);
      const allGaps = groupMissingGaps(missing);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      
      const upcomingGaps = allGaps.filter((g) => g.start >= todayStr);
      if (upcomingGaps.length > 0) {
        const nextGap = upcomingGaps[0];
        const gapDate = new Date(nextGap.start);
        gapDate.setHours(0, 0, 0, 0);
        
        const diffTime = gapDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        setDaysUntil(diffDays);
      } else {
        setDaysUntil(null);
      }
      setLoadingAccs(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTrip]);

  if (tripLoading || loadingAccs) {
    return (
      <Card title="Days Until Missing Night" description="Next accommodation gap.">
        <p className="text-sm text-on-surface-variant">Loading...</p>
      </Card>
    );
  }

  if (!activeTrip) {
    return (
      <Card title="Days Until Missing Night" description="Next accommodation gap.">
        <p className="text-sm text-on-surface-variant">No active trip.</p>
      </Card>
    );
  }

  return (
    <Card title="Days Until Missing Night" description={`For ${activeTrip.name}.`}>
      {daysUntil === null ? (
        <p className="text-sm text-on-surface-variant">No upcoming gaps! You're covered.</p>
      ) : (
        <div className="flex flex-col items-center justify-center py-2">
          <span className="text-5xl font-bold text-primary">{daysUntil}</span>
          <span className="text-sm text-on-surface-variant mt-2">days until next gap</span>
        </div>
      )}
    </Card>
  );
}
