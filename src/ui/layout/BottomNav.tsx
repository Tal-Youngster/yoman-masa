import { Link } from '@tanstack/react-router';
import { TABS } from './tabs';
import { cn } from '../components/cn';

export function BottomNav(): React.JSX.Element {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-10 border-t border-slate-800 bg-slate-950/95 backdrop-blur',
        'md:hidden',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="grid grid-cols-8">
        {TABS.map((tab) => (
          <li key={tab.to} className="contents">
            <Link
              to={tab.to}
              activeOptions={{ exact: tab.to === '/' }}
              className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] text-slate-400 transition-colors"
              activeProps={{ 'aria-current': 'page', className: 'text-sky-400' }}
            >
              <span aria-hidden="true" className="text-base leading-none">
                {tab.icon}
              </span>
              <span>{tab.shortLabel}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
