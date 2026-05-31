import { describe, expect, it } from 'vitest';

import { computePath } from './computePath';
import { newAccommodation, type Accommodation } from '@/domain/accommodation';
import { newPlace, type Place } from '@/domain/place';
import { isoDate } from '@/domain/dates';
import { TripId } from '@/domain/ids';

const TRIP = TripId.parse('trp_01HMVPRDXG6Z9YV2N5W4F3K7BC');

const stay = (
  overrides: Partial<Parameters<typeof newAccommodation>[0]> & { name: string; checkin: string },
): Accommodation => {
  const { checkin, ...rest } = overrides;
  return newAccommodation({
    trip_id: TRIP,
    status: 'booked',
    service: 'airbnb',
    checkout: isoDate(checkin), // checkout >= checkin (refine allows equal)
    location: { address: 'somewhere', lat: 35, lng: 139 },
    ...rest,
    checkin: isoDate(checkin),
  });
};

const visitedPlace = (overrides: {
  alias: string;
  date: string;
  lat: number;
  lng: number;
  place_id?: string;
}): Place =>
  newPlace({
    trip_id: TRIP,
    place_id: overrides.place_id ?? `ChIJ_${overrides.alias}`,
    place_alias: overrides.alias,
    visited: true,
    visited_date: isoDate(overrides.date),
    lat: overrides.lat,
    lng: overrides.lng,
  });

describe('computePath', () => {
  it('returns empty for empty input', () => {
    expect(computePath({ accommodations: [], places: [] })).toEqual([]);
  });

  it('drops accommodations without location', () => {
    const a = newAccommodation({
      trip_id: TRIP,
      status: 'booked',
      name: 'No address',
      service: 'direct',
      checkin: isoDate('2026-07-01'),
      checkout: isoDate('2026-07-03'),
    });
    expect(computePath({ accommodations: [a], places: [] })).toEqual([]);
  });

  it('drops cancelled accommodations even if located', () => {
    const a = stay({ name: 'Cancelled', checkin: '2026-07-01', status: 'cancelled' });
    expect(computePath({ accommodations: [a], places: [] })).toEqual([]);
  });

  it('keeps wishlist (non-cancelled) accommodations — only cancelled is dropped', () => {
    const a = stay({ name: 'Wishlisted', checkin: '2026-07-01', status: 'wishlist' });
    const path = computePath({ accommodations: [a], places: [] });
    expect(path).toHaveLength(1);
    expect(path[0]?.kind).toBe('accommodation');
  });

  it('drops places that are not marked visited', () => {
    const p = newPlace({
      trip_id: TRIP,
      place_id: 'ChIJ_x',
      visited: false,
      lat: 1,
      lng: 2,
    });
    expect(computePath({ accommodations: [], places: [p] })).toEqual([]);
  });

  it('drops visited places without a visited_date', () => {
    const p = newPlace({
      trip_id: TRIP,
      place_id: 'ChIJ_x',
      visited: true,
      lat: 1,
      lng: 2,
    });
    expect(computePath({ accommodations: [], places: [p] })).toEqual([]);
  });

  it('drops visited places without coordinates', () => {
    const p = newPlace({
      trip_id: TRIP,
      place_id: 'ChIJ_x',
      visited: true,
      visited_date: isoDate('2026-07-01'),
    });
    expect(computePath({ accommodations: [], places: [p] })).toEqual([]);
  });

  it('orders by date across accommodations and places', () => {
    const stays = [
      stay({ name: 'Tokyo Stay', checkin: '2026-07-05' }),
      stay({ name: 'Kyoto Stay', checkin: '2026-07-01' }),
    ];
    const places = [
      visitedPlace({ alias: 'Fushimi Inari', date: '2026-07-03', lat: 34.97, lng: 135.77 }),
    ];
    const path = computePath({ accommodations: stays, places });
    expect(path.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-03', '2026-07-05']);
    expect(path.map((p) => p.label)).toEqual(['Kyoto Stay', 'Fushimi Inari', 'Tokyo Stay']);
  });

  it('on date tie: accommodation precedes place', () => {
    const a = stay({ name: 'A-stay', checkin: '2026-07-04' });
    const p = visitedPlace({ alias: 'P-place', date: '2026-07-04', lat: 0, lng: 0 });
    const path = computePath({ accommodations: [a], places: [p] });
    expect(path.map((x) => x.kind)).toEqual(['accommodation', 'place']);
  });

  it('on date+kind tie: entityId order is stable', () => {
    const p1 = visitedPlace({ alias: 'first', date: '2026-07-04', lat: 0, lng: 0 });
    const p2 = visitedPlace({ alias: 'second', date: '2026-07-04', lat: 1, lng: 1 });
    const path = computePath({ accommodations: [], places: [p1, p2] });
    // Both have the same date and kind; sort key is entityId (ULID, ascending).
    const sortedIds = [p1.id, p2.id].sort();
    expect(path.map((x) => x.entityId)).toEqual(sortedIds);
  });

  it('uses place_id as label when place_alias is empty', () => {
    const p = newPlace({
      trip_id: TRIP,
      place_id: 'ChIJ_unnamed',
      place_alias: '',
      visited: true,
      visited_date: isoDate('2026-07-04'),
      lat: 0,
      lng: 0,
    });
    const [point] = computePath({ accommodations: [], places: [p] });
    expect(point?.label).toBe('ChIJ_unnamed');
  });

  it('round-trips a realistic 10-entry fixture', () => {
    const accs = [
      stay({ name: 'Lisbon Apt',  checkin: '2026-06-01', location: { address: 'Lisbon', lat: 38.72, lng: -9.14 } }),
      stay({ name: 'Porto Hotel', checkin: '2026-06-05', location: { address: 'Porto',  lat: 41.15, lng: -8.62 } }),
      stay({ name: 'Madrid B&B',  checkin: '2026-06-10', location: { address: 'Madrid', lat: 40.42, lng: -3.70 } }),
      stay({ name: 'Sevilla Inn', checkin: '2026-06-15', location: { address: 'Sevilla',lat: 37.39, lng: -5.99 } }),
    ];
    const places = [
      visitedPlace({ alias: 'Belém Tower',      date: '2026-06-02', lat: 38.69, lng: -9.21 }),
      visitedPlace({ alias: 'Livraria Lello',   date: '2026-06-06', lat: 41.14, lng: -8.61 }),
      visitedPlace({ alias: 'Prado Museum',     date: '2026-06-11', lat: 40.41, lng: -3.69 }),
      visitedPlace({ alias: 'Reina Sofía',      date: '2026-06-12', lat: 40.40, lng: -3.69 }),
      visitedPlace({ alias: 'Plaza de España',  date: '2026-06-16', lat: 37.37, lng: -5.98 }),
      visitedPlace({ alias: 'Alcázar',          date: '2026-06-17', lat: 37.38, lng: -5.99 }),
    ];

    const path = computePath({ accommodations: accs, places });
    expect(path).toHaveLength(10);
    // Dates must be non-decreasing.
    const dates = path.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
    // The first point is the first stay (a tie with no place); the last is Alcázar.
    expect(path[0]?.label).toBe('Lisbon Apt');
    expect(path[path.length - 1]?.label).toBe('Alcázar');
  });
});
