import { Link } from '@tanstack/react-router';
import {
  LayoutDashboard,
  Plane,
  BedDouble,
  Coins,
  MapPin,
  CheckSquare,
  ShoppingBag,
  BookOpen,
} from 'lucide-react';
import { TABS } from './tabs';
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
    case 'expenses':
      return <Coins {...props} />;
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
    .filter((t): t is typeof TABS[0] => t !== undefined);

  return (
    <nav
      aria-label="Primary"
      className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:gap-2 md:border-r md:border-outline-variant md:bg-surface-container md:px-4 md:py-8 lg:py-16"
    >
      <ul className="flex flex-col gap-1">
        {sortedTabs.map((tab) => (
          <li key={tab.to}>
            <Link
              to={tab.to}
              activeOptions={{ exact: tab.to === '/' }}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
              activeProps={{
                'aria-current': 'page',
                className: 'bg-surface-container-highest text-primary font-medium',
              }}
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
