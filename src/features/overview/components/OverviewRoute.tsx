import { Link } from '@tanstack/react-router';
import { Compass } from 'lucide-react';
import { EmptyState } from '@/ui/components';
import { useActiveTrip } from '@/ui/layout/useActiveTrip';
import { GeneralOverviewCard } from './GeneralOverviewCard';
import { TripMapPreviewCard } from './TripMapPreviewCard';
import { MissingNightOverviewCard } from './MissingNightOverviewCard';
import { TasksOverviewCard } from './TasksOverviewCard';
import { ShoppingOverviewCard } from './ShoppingOverviewCard';

export function OverviewRoute(): React.JSX.Element {
  const { activeTrip, loading } = useActiveTrip();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-lg font-semibold text-on-surface">Trip Overview</h2>
        <p className="text-xs text-on-surface-variant">Everything for your active trip at a glance.</p>
      </header>

      {loading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : !activeTrip ? (
        <NoActiveTrip />
      ) : (
        <>
          <GeneralOverviewCard trip={activeTrip} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TripMapPreviewCard trip={activeTrip} />
            <MissingNightOverviewCard trip={activeTrip} />
            <TasksOverviewCard trip={activeTrip} />
            <ShoppingOverviewCard trip={activeTrip} />
          </div>
        </>
      )}
    </div>
  );
}

function NoActiveTrip(): React.JSX.Element {
  return (
    <EmptyState
      icon={<Compass className="h-7 w-7" />}
      title="Welcome aboard"
      description="Pick a trip to enter — or create your first one — and this overview will fill with your map, stays, tasks, and shopping."
      action={
        <Link
          to="/trips"
          className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary shadow-soft transition-opacity hover:opacity-90"
        >
          Go to Trips
        </Link>
      }
    />
  );
}
