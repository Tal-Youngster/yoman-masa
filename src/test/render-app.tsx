import { render, type RenderResult } from '@testing-library/react';
import { useAuthStore } from '@/app/auth-store';
import { Providers } from '@/app/providers';
import { AppRoot } from '@/app/AppRoot';
import { createMemoryRouter } from '@/app/router';
import { createMemoryKVStore } from '@/app/kv-store';
import { createMockTripsStore } from '@/app/trips-store';
import type { AppServices } from '@/app/context';
import type { Trip } from '@/domain';

export interface RenderAppOptions {
  initialPath?: string;
  trips?: Trip[];
  initialActiveTripId?: string | null;
}

export function renderApp(opts: RenderAppOptions = {}): RenderResult & {
  services: AppServices;
} {
  const services: AppServices = {
    kv: createMemoryKVStore(
      opts.initialActiveTripId !== undefined ? { active_trip_id: opts.initialActiveTripId } : {},
    ),
    trips: createMockTripsStore(opts.trips ?? []),
  };
  
  // Ensure the user is authenticated for app routes
  useAuthStore.setState({ isAuthenticated: true, user: { email: 'test@example.com', name: 'Test User' } });

  const router = createMemoryRouter(opts.initialPath ?? '/');
  const result = render(<AppRoot services={services} router={router} />);
  return Object.assign(result, { services });
}

export function renderWithServices(
  ui: React.ReactElement,
  services?: Partial<AppServices>,
): RenderResult & { services: AppServices } {
  const resolved: AppServices = {
    kv: services?.kv ?? createMemoryKVStore(),
    trips: services?.trips ?? createMockTripsStore(),
  };
  const result = render(<Providers services={resolved}>{ui}</Providers>);
  return Object.assign(result, { services: resolved });
}
