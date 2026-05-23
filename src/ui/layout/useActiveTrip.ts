import { useCallback, useEffect, useState } from 'react';
import { useAppServices } from '@/app/use-app-services';
import type { Trip } from '@/domain';

interface ActiveTripState {
  trips: Trip[];
  activeTripId: string | null;
  loading: boolean;
}

export interface UseActiveTrip extends ActiveTripState {
  activeTrip: Trip | null;
  setActiveTrip: (tripId: string | null) => Promise<void>;
}

/**
 * Default selection: if `active_trip_id` is set and still exists, use it;
 * otherwise the first `status === 'active'` trip; otherwise null (callers
 * should deep-link to the Trips slice to create one).
 */
function pickDefaultActive(trips: Trip[], stored: string | null): string | null {
  if (stored && trips.some((t) => t.id === stored)) return stored;
  const firstActive = trips.find((t) => t.status === 'active');
  return firstActive?.id ?? null;
}

export function useActiveTrip(): UseActiveTrip {
  const { kv, trips: tripsStore } = useAppServices();
  const [state, setState] = useState<ActiveTripState>({
    trips: [],
    activeTripId: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [list, stored] = await Promise.all([tripsStore.list(), kv.get('active_trip_id')]);
      if (cancelled) return;
      const chosen = pickDefaultActive(list, stored);
      if (chosen !== stored) {
        await kv.set('active_trip_id', chosen);
      }
      if (cancelled) return;
      setState({ trips: list, activeTripId: chosen, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [kv, tripsStore]);

  const setActiveTrip = useCallback(
    async (tripId: string | null): Promise<void> => {
      await kv.set('active_trip_id', tripId);
      setState((s) => ({ ...s, activeTripId: tripId }));
    },
    [kv],
  );

  const activeTrip = state.trips.find((t) => t.id === state.activeTripId) ?? null;

  return { ...state, activeTrip, setActiveTrip };
}
