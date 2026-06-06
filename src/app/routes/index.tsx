import { Link } from '@tanstack/react-router';
import { Card } from '@/ui/components';
import { TripsRoute as TripsRouteImpl } from '@/features/trips/components';
export { LoginRoute } from './login';

import { MissingNightsDashboardCard, DaysUntilMissingNightCard } from '@/features/missing-nights/components';
import { TasksDashboardCard } from '@/features/tasks/components';

function PathMapDashboardCard(): React.JSX.Element {
  return (
    <Card title="Path map" description="Date-ordered trace of your trip.">
      <Link
        to="/path-map"
        className="inline-block rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90"
      >
        Open path map
      </Link>
    </Card>
  );
}

export function DashboardRoute(): React.JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Dashboard" description="Overview of the active trip.">
        <p className="text-slate-400">Feature content lands in later slices.</p>
      </Card>
      <MissingNightsDashboardCard />
      <DaysUntilMissingNightCard />
      <TasksDashboardCard />
      <PathMapDashboardCard />
    </div>
  );
}

export const TripsRoute = TripsRouteImpl;

export { AccommodationsRoute } from '@/features/accommodations/components';
export { PlacesRoute } from '@/features/places/components';
export { ExpensesRoute } from '@/features/expenses/components';
export { TasksRoute } from '@/features/tasks/components';
export { ShoppingRoute } from '@/features/shopping/components';
export { PathMapRoute } from '@/features/path-map/components';

export function ArticlesRoute(): React.JSX.Element {
  return (
    <Card title="Articles" description="Saved articles and notes.">
      <p className="text-slate-400">S12 — Articles will populate this view.</p>
    </Card>
  );
}
