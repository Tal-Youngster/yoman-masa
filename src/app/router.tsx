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
  LoginRoute,
} from './routes';
import { useAuthStore } from './auth-store';
import { Outlet, redirect } from '@tanstack/react-router';

const rootRoute = createRootRoute({
  component: Outlet,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginRoute,
});

const appRoute = createRoute({
  id: '_app',
  getParentRoute: () => rootRoute,
  component: Shell,
  beforeLoad: () => {
    if (!useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  component: DashboardRoute,
});
const tripsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/trips',
  component: TripsRoute,
});
const accommodationsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/accommodations',
  component: AccommodationsRoute,
});
const expensesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/expenses',
  component: ExpensesRoute,
});
const placesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/places',
  component: PlacesRoute,
});
const tasksRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/tasks',
  component: TasksRoute,
});
const shoppingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/shopping',
  component: ShoppingRoute,
});
const articlesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/articles',
  component: ArticlesRoute,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  appRoute.addChildren([
    dashboardRoute,
    tripsRoute,
    accommodationsRoute,
    expensesRoute,
    placesRoute,
    tasksRoute,
    shoppingRoute,
    articlesRoute,
  ]),
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
