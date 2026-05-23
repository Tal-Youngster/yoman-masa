import { useContext } from 'react';
import { AppServicesContext, type AppServices } from './context';

export function useAppServices(): AppServices {
  const ctx = useContext(AppServicesContext);
  if (!ctx) throw new Error('useAppServices must be used inside <AppServicesProvider>');
  return ctx;
}
