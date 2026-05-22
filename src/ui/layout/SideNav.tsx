import { Link } from '@tanstack/react-router';
import { TABS } from './tabs';

export function SideNav(): React.JSX.Element {
  return (
    <nav
      aria-label="Primary"
      className="hidden md:flex md:w-56 md:shrink-0 md:flex-col md:gap-1 md:border-r md:border-slate-800 md:bg-slate-950/80 md:px-3 md:py-4"
    >
      <ul className="flex flex-col gap-1">
        {TABS.map((tab) => (
          <li key={tab.to}>
            <Link
              to={tab.to}
              activeOptions={{ exact: tab.to === '/' }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-slate-800/60"
              activeProps={{
                'aria-current': 'page',
                className: 'bg-slate-800 text-sky-300',
              }}
            >
              <span aria-hidden="true" className="w-5 text-center text-base">
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
