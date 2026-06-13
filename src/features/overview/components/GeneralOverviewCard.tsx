import ReactCountryFlag from 'react-country-flag';
import { CalendarDays, Coins, MapPinned } from 'lucide-react';
import type { Trip } from '@/domain/trip';
import { getDisplayStatus } from '@/features/trips/status';
import { StatusPill } from '@/features/trips/components/StatusPill';

function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Human phrase for where the trip sits relative to today. */
function timingLabel(trip: Trip): string {
  const today = todayIso();
  const status = getDisplayStatus(trip);
  if (status === 'planned') {
    const d = daysBetween(today, trip.start_date);
    return d === 0 ? 'Starts today' : `Starts in ${d} day${d === 1 ? '' : 's'}`;
  }
  if (status === 'completed') return 'Trip complete';
  // active — inclusive day count
  const total = daysBetween(trip.start_date, trip.end_date) + 1;
  const elapsed = daysBetween(trip.start_date, today) + 1;
  return `Day ${elapsed} of ${total}`;
}

function formatRange(startIso: string, endIso: string): string {
  const fmt = (iso: string): string =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  return `${fmt(startIso)} → ${fmt(endIso)}`;
}

export function GeneralOverviewCard({ trip }: { trip: Trip }): React.JSX.Element {
  const codes = trip.country_codes ?? [];
  const totalDays = daysBetween(trip.start_date, trip.end_date) + 1;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface-container to-surface-container-low p-5 shadow-soft sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {codes.length > 0 && (
            <span className="mb-2 inline-flex gap-1.5 text-xl" aria-label={codes.join(', ')}>
              {codes.map((c) => (
                <ReactCountryFlag key={c} countryCode={c} svg />
              ))}
            </span>
          )}
          <h3 className="text-headline-sm text-on-surface sm:text-headline-lg">
            {trip.name}
          </h3>
        </div>
        <StatusPill trip={trip} />
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Fact icon={<CalendarDays className="h-4 w-4" />} label="Dates">
          {formatRange(trip.start_date, trip.end_date)}
        </Fact>
        <Fact icon={<MapPinned className="h-4 w-4" />} label="Duration">
          {totalDays} day{totalDays === 1 ? '' : 's'} · {timingLabel(trip)}
        </Fact>
        <Fact icon={<Coins className="h-4 w-4" />} label="Home currency">
          {trip.home_currency}
        </Fact>
      </dl>
    </section>
  );
}

function Fact({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div className="min-w-0">
        <dt className="text-label-caps text-on-surface-variant">{label}</dt>
        <dd className="text-sm font-medium text-on-surface">{children}</dd>
      </div>
    </div>
  );
}
