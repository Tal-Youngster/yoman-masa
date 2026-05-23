import { Plane } from 'lucide-react';
import { useRouterState } from '@tanstack/react-router';
import { TripSwitcher } from './TripSwitcher';

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
        <Plane className="w-5 h-5 text-primary shrink-0" aria-hidden="true" />
        <h1 className="text-sm font-semibold text-on-surface">Travel Journal</h1>
      </div>
      {!hideSwitcher && <TripSwitcher />}
    </header>
  );
}
