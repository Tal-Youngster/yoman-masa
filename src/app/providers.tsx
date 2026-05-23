import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppServicesProvider, type AppServices } from './context';
import { ActiveTripProvider } from '@/ui/layout/useActiveTrip';

export interface ProvidersProps {
  services: AppServices;
  children: ReactNode;
}

/**
 * App-wide providers. TanStack Query client is plain for now; the Dexie
 * persister is wired in once S2 (storage) lands.
 */
export function Providers({ services, children }: ProvidersProps): React.JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppServicesProvider services={services}>
        <ActiveTripProvider>{children}</ActiveTripProvider>
      </AppServicesProvider>
    </QueryClientProvider>
  );
}
