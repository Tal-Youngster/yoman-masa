import { TripsRoute as TripsRouteImpl } from '@/features/trips/components';
import { OverviewRoute } from '@/features/overview/components';
export { LoginRoute } from './login';

export const DashboardRoute = OverviewRoute;

export const TripsRoute = TripsRouteImpl;

export { AccommodationsRoute } from '@/features/accommodations/components';
export { PlacesRoute } from '@/features/places/components';
export { TasksRoute } from '@/features/tasks/components';
export { ShoppingRoute } from '@/features/shopping/components';
export { ArticlesRoute } from '@/features/articles/components';
