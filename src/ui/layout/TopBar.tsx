import { Plane } from 'lucide-react';
import { useRouterState } from '@tanstack/react-router';
import { TripSwitcher } from './TripSwitcher';
import { AccountMenu } from './AccountMenu';
import { SyncStatus } from './SyncStatus';

export function TopBar(): React.JSX.Element {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Trips selection happens inline on the /trips page — no need to duplicate
  // the switcher in the top bar there.
  const hideSwitcher = pathname.startsWith('/trips');

  return (
    <header
      className="sticky top-0 z-10 flex min-h-14 py-2 items-center justify-between border-b border-outline-variant bg-surface/95 px-4 backdrop-blur"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Plane className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
        </span>
        <h1 className="text-base font-semibold text-on-surface sm:text-lg">Travel Journal</h1>
      </div>
      <div className="flex items-center gap-3">
        {!hideSwitcher && <TripSwitcher />}
        <SyncStatus />
        <AccountMenu />
      </div>
    </header>
  );
}
