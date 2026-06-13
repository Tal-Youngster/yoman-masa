import { Card } from '@/ui/components';
import { TripsRoute as TripsRouteImpl } from '@/features/trips/components';
import { OverviewRoute } from '@/features/overview/components';
export { LoginRoute } from './login';

export const DashboardRoute = OverviewRoute;

export const TripsRoute = TripsRouteImpl;

export { AccommodationsRoute } from '@/features/accommodations/components';
export { PlacesRoute } from '@/features/places/components';
export { ExpensesRoute } from '@/features/expenses/components';
export { TasksRoute } from '@/features/tasks/components';
export { ShoppingRoute } from '@/features/shopping/components';

export function ArticlesRoute(): React.JSX.Element {
  return (
    <Card title="Articles" description="Saved articles and notes.">
      <p className="text-slate-400">S12 — Articles will populate this view.</p>
    </Card>
  );
}
