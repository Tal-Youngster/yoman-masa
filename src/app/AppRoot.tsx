import { useRef } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { Providers } from './providers';
import { createAppRouter, type AppRouter } from './router';
import type { AppServices } from './context';

export interface AppRootProps {
  services: AppServices;
  /** Test override: provide a pre-built router (e.g. memory history). */
  router?: AppRouter;
}

/**
 * Root component. The router instance is created once via `useRef` so React 19
 * StrictMode's double-invoke of render and effects can't re-create it.
 */
export function AppRoot({ services, router }: AppRootProps): React.JSX.Element {
  const routerRef = useRef<AppRouter | null>(router ?? null);
  if (!routerRef.current) {
    routerRef.current = createAppRouter();
  }
  return (
    <Providers services={services}>
      <RouterProvider router={routerRef.current} />
    </Providers>
  );
}
