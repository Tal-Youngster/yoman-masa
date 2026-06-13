import { Link } from '@tanstack/react-router';
import { Compass } from 'lucide-react';
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
        <EmptyState />
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

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant bg-surface-container-low px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Compass className="h-7 w-7" />
      </span>
      <div>
        <h3 className="text-headline-sm text-on-surface">Welcome aboard</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-on-surface-variant">
          Pick a trip to enter — or create your first one — and this overview will fill with your
          map, stays, tasks, and shopping.
        </p>
      </div>
      <Link
        to="/trips"
        className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-on-primary shadow-soft transition-opacity hover:opacity-90"
      >
        Go to Trips
      </Link>
    </div>
  );
}
