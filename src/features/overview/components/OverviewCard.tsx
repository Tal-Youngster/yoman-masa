import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

export type OverviewTarget = '/places' | '/accommodations' | '/tasks' | '/shopping';

export interface OverviewCardProps {
  /** Tab this card drills into when tapped. */
  to: OverviewTarget;
  title: string;
  icon: React.ReactNode;
  /** Short accessible hint, e.g. "Open accommodations". */
  cta: string;
  children: React.ReactNode;
}

/**
 * A summary tile on the Trip Overview. The whole card is a link into its tab;
 * hover/press lift it so it reads as tappable.
 */
export function OverviewCard({ to, title, icon, cta, children }: OverviewCardProps): React.JSX.Element {
  return (
    <Link
      to={to}
      aria-label={cta}
      className="group flex flex-col rounded-xl border border-outline-variant bg-surface-container p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-floating focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
        <ChevronRight className="ml-auto h-4 w-4 text-on-surface-variant transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
      </div>
      <div className="flex-1 text-sm text-on-surface">{children}</div>
    </Link>
  );
}
