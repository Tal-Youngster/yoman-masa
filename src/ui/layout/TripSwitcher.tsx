import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { useActiveTrip } from './useActiveTrip';

export function TripSwitcher(): React.JSX.Element {
  const { trips, activeTrip, activeTripId, loading, setActiveTrip } = useActiveTrip();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const label = loading
    ? 'Loading…'
    : (activeTrip?.name ?? (trips.length === 0 ? 'No trips yet' : 'Select trip'));

  const handleSelect = async (tripId: string): Promise<void> => {
    await setActiveTrip(tripId);
    setOpen(false);
  };

  const handleCreate = async (): Promise<void> => {
    setOpen(false);
    await navigate({ to: '/trips' });
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Switch active trip"
        data-testid="trip-switcher-trigger"
      >
        <span className="truncate max-w-[12ch] text-left">{label}</span>
        <span aria-hidden="true">▾</span>
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} side="bottom" title="Switch trip">
        {trips.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-on-surface-variant">
              You don&apos;t have any trips yet. Create your first one to get going.
            </p>
            <Button onClick={() => void handleCreate()} data-testid="trip-switcher-create">
              Create trip
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {trips.map((trip) => {
              const isActive = trip.id === activeTripId;
              return (
                <li key={trip.id}>
                  <button
                    type="button"
                    onClick={() => void handleSelect(trip.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={
                      'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ' +
                      (isActive
                        ? 'bg-surface-container text-primary'
                        : 'text-on-surface hover:bg-surface-container/60')
                    }
                    data-testid={`trip-switcher-option-${trip.id}`}
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">{trip.name}</span>
                      <span className="text-xs text-on-surface-variant">
                        {trip.start_date} → {trip.end_date} · {trip.status}
                      </span>
                    </span>
                    {isActive && <span aria-hidden="true">✓</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </>
  );
}
