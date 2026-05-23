import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { MoreHorizontal } from 'lucide-react';
import { TABS, type TabDef } from './tabs';
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

  const pinnedTabs = sortedTabs.slice(0, 4);

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
          {pinnedTabs.map((tab) => (
            <li key={tab.to} className="contents">
              <Link
                to={tab.to}
                activeOptions={{ exact: tab.to === '/' }}
                className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-on-surface-variant transition-colors"
                activeProps={{ 'aria-current': 'page', className: 'text-primary' }}
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
