import { Card } from '@/ui/components';
import { TripsRoute as TripsRouteImpl } from '@/features/trips/components';

export function DashboardRoute(): React.JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Dashboard" description="Overview of the active trip.">
        <p className="text-slate-400">Feature content lands in later slices.</p>
      </Card>
    </div>
  );
}

export const TripsRoute = TripsRouteImpl;

export function AccommodationsRoute(): React.JSX.Element {
  return (
    <Card title="Accommodations" description="Where you sleep and for how long.">
      <p className="text-slate-400">S6 — Accommodations will populate this view.</p>
    </Card>
  );
}

export function ExpensesRoute(): React.JSX.Element {
  return (
    <Card title="Expenses" description="Multi-currency spending.">
      <p className="text-slate-400">S7 — Expenses + FX will populate this view.</p>
    </Card>
  );
}

export function PlacesRoute(): React.JSX.Element {
  return (
    <Card title="Places" description="Wishlist + visited map.">
      <p className="text-slate-400">S8 — Places will populate this view.</p>
    </Card>
  );
}

export function TasksRoute(): React.JSX.Element {
  return (
    <Card title="Tasks" description="Trip tasks plus a General bucket.">
      <p className="text-slate-400">S10 — Tasks will populate this view.</p>
    </Card>
  );
}

export function ShoppingRoute(): React.JSX.Element {
  return (
    <Card title="Shopping" description="Per-trip and General shopping lists.">
      <p className="text-slate-400">S11 — Shopping will populate this view.</p>
    </Card>
  );
}

export function ArticlesRoute(): React.JSX.Element {
  return (
    <Card title="Articles" description="Saved articles and notes.">
      <p className="text-slate-400">S12 — Articles will populate this view.</p>
    </Card>
  );
}
