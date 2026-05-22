import { createContext, type ReactNode } from 'react';
import type { KVStore } from './kv-store';
import type { TripsStore } from './trips-store';

export interface AppServices {
  kv: KVStore;
  trips: TripsStore;
}

// eslint-disable-next-line react-refresh/only-export-components
export const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>
  );
}
