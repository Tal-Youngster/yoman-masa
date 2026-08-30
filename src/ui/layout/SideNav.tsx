import { Link } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Plane,
  BedDouble,
  MapPin,
  CheckSquare,
  ShoppingBag,
  BookOpen,
} from 'lucide-react';
import { TABS, TRIPS_TAB } from './tabs';
import { useNavStore } from '../../lib/navStore';

export interface TabIconProps {
  name: string;
  className?: string;
}

export function TabIcon({ name, className }: TabIconProps): React.JSX.Element | null {
  const props = { className: className ?? 'w-5 h-5 shrink-0', 'aria-hidden': true };
  switch (name) {
    case 'dashboard':
      return <LayoutDashboard {...props} />;
    case 'trips':
      return <Plane {...props} />;
    case 'accommodations':
      return <BedDouble {...props} />;
    case 'places':
      return <MapPin {...props} />;
    case 'tasks':
      return <CheckSquare {...props} />;
    case 'shopping':
      return <ShoppingBag {...props} />;
    case 'articles':
      return <BookOpen {...props} />;
    default:
      return null;
  }
}

export function SideNav(): React.JSX.Element {
  const { tabOrder } = useNavStore();

  const sortedTabs = tabOrder
    .map((to) => TABS.find((t) => t.to === to))
    .filter((t): t is (typeof TABS)[number] => t !== undefined);

  return (
    <nav
      aria-label="Primary"
      className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:border-r md:border-outline-variant md:bg-surface-container md:px-4 md:py-8 lg:py-16"
    >
      {/* Master tab — switching trips changes the context every tab below is
          scoped to, so it gets a distinct, elevated treatment. */}
      <Link
        to={TRIPS_TAB.to}
        className="flex items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
        activeProps={{
          'aria-current': 'page',
          className:
            'flex items-center gap-3 rounded-xl border border-primary bg-primary px-3 py-2.5 text-sm font-semibold text-on-primary shadow-soft',
        }}
      >
        <TabIcon name={TRIPS_TAB.icon} />
        <span>{TRIPS_TAB.label}</span>
      </Link>

      <div className="my-4 border-t border-outline-variant" />

      <p className="mb-1 px-3 text-label-caps text-on-surface-variant">Active trip</p>
      <ul className="flex flex-col gap-1">
        {sortedTabs.map((tab) => (
          <li key={tab.to}>
            <Link
              to={tab.to}
              activeOptions={{ exact: tab.to === '/' }}
              // Colour lives in inactive/active props, not the base class, so the
              // active `text-primary` can't lose a CSS-order tie to a base colour.
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-surface-container-high"
              activeProps={{
                'aria-current': 'page',
                className: 'bg-surface-container-highest text-primary font-medium',
              }}
              inactiveProps={{ className: 'text-on-surface-variant' }}
            >
              <TabIcon name={tab.icon} />
              <span>{tab.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
