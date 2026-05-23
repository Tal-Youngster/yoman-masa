import type { Trip } from '@/domain';

export function makeTrip(overrides: Partial<Trip> = {}): Trip {
  const base: Trip = {
    type: 'trip',
    id: '01HZX0000000000000000TRIP1' as Trip['id'],
    slug: 'kyoto-2026',
    name: 'Kyoto 2026',
    start_date: '2026-09-01' as Trip['start_date'],
    end_date: '2026-09-21' as Trip['end_date'],
    home_currency: 'USD' as Trip['home_currency'],
    country_codes: [],
    notes: '',
  };
  return { ...base, ...overrides };
}
