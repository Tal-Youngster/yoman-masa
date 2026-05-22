import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from '@tanstack/react-router';
import { Shell } from '@/ui/layout';
import {
  AccommodationsRoute,
  ArticlesRoute,
  DashboardRoute,
  ExpensesRoute,
  PlacesRoute,
  ShoppingRoute,
  TasksRoute,
  TripsRoute,
} from './routes';

const rootRoute = createRootRoute({ component: Shell });

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardRoute,
});
const tripsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trips',
  component: TripsRoute,
});
const accommodationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/accommodations',
  component: AccommodationsRoute,
});
const expensesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/expenses',
  component: ExpensesRoute,
});
const placesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/places',
  component: PlacesRoute,
});
const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tasks',
  component: TasksRoute,
});
const shoppingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shopping',
  component: ShoppingRoute,
});
const articlesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/articles',
  component: ArticlesRoute,
});

const routeTree = rootRoute.addChildren([
  dashboardRoute,
  tripsRoute,
  accommodationsRoute,
  expensesRoute,
  placesRoute,
  tasksRoute,
  shoppingRoute,
  articlesRoute,
]);

export interface CreateAppRouterOptions {
  /** Allow tests to use an in-memory history; defaults to the browser history. */
  history?: RouterHistory;
}

export function createAppRouter(opts: CreateAppRouterOptions = {}) {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    ...(opts.history ? { history: opts.history } : {}),
  });
}

export function createMemoryRouter(initialPath: string = '/') {
  return createAppRouter({
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
