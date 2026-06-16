import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { MoreHorizontal } from 'lucide-react';
import { TABS, TRIPS_TAB, type TabDef } from './tabs';
import { cn } from '../components/cn';
import { TabIcon } from './SideNav';
import { useNavStore } from '../../lib/navStore';
import { MoreNavSheet } from './MoreNavSheet';

export function BottomNav(): React.JSX.Element {
  const { tabOrder } = useNavStore();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const sortedTabs = tabOrder
    .map((to) => TABS.find((t) => t.to === to))
    .filter((t): t is TabDef => t !== undefined);

  // Slot 1 is the Trips master tab; that leaves three pinned per-trip tabs
  // before the More overflow.
  const pinnedTabs = sortedTabs.slice(0, 3);

  return (
    <>
      <nav
        aria-label="Primary"
        className={cn(
          'fixed inset-x-0 bottom-0 z-10 border-t border-outline-variant bg-surface/95 backdrop-blur',
          'md:hidden',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="grid grid-cols-5">
          <li className="contents">
            <Link
              to={TRIPS_TAB.to}
              className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold text-primary transition-colors"
              activeProps={{ 'aria-current': 'page', className: 'text-primary' }}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                <TabIcon name={TRIPS_TAB.icon} className="h-4 w-4 shrink-0" />
              </span>
              <span>{TRIPS_TAB.shortLabel}</span>
            </Link>
          </li>
          {pinnedTabs.map((tab) => (
            <li key={tab.to} className="contents">
              <Link
                to={tab.to}
                activeOptions={{ exact: tab.to === '/' }}
                // Keep the colour out of the base class: TanStack only *appends*
                // activeProps, so a base `text-*` would collide with the active
                // `text-primary` and the winner would come down to CSS order, not
                // the active state. Split inactive/active colours instead.
                className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] transition-colors"
                activeProps={{ 'aria-current': 'page', className: 'text-primary' }}
                inactiveProps={{ className: 'text-on-surface-variant' }}
              >
                <TabIcon name={tab.icon} className="w-5 h-5 shrink-0" />
                <span>{tab.shortLabel}</span>
              </Link>
            </li>
          ))}
          <li className="contents">
            <button
              type="button"
              onClick={() => setIsMoreOpen(true)}
              className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              <MoreHorizontal className="w-5 h-5 shrink-0" />
              <span>More</span>
            </button>
          </li>
        </ul>
      </nav>
      <MoreNavSheet open={isMoreOpen} onClose={() => setIsMoreOpen(false)} />
    </>
  );
}
