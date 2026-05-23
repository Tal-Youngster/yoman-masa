import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseAccommodation, serializeAccommodation } from './parser';
import { Accommodation } from '@/domain/accommodation';
import { newAccommodationId, newTripId } from '@/domain/ids';

const idArb = fc.constantFrom(newAccommodationId(), newAccommodationId(), newAccommodationId());
const tripIdArb = fc.constantFrom(newTripId(), newTripId());
const statusArb = fc.constantFrom('booked', 'wishlist', 'cancelled');
const serviceArb = fc.constantFrom('airbnb', 'booking', 'hostelworld', 'agoda', 'direct') as fc.Arbitrary<Accommodation['service']>;

// Generate valid date pairs where checkin <= checkout
const datesArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }).chain(checkin => 
  fc.date({ min: checkin, max: new Date(checkin.getTime() + 1000 * 60 * 60 * 24 * 30) }).map(checkout => ({
    checkin: checkin.toISOString().split('T')[0],
    checkout: checkout.toISOString().split('T')[0]
  }))
);

const accommodationArb = fc.record({
  type: fc.constant('accommodation'),
  id: idArb,
  trip_id: tripIdArb,
  status: statusArb,
  name: fc.string({ minLength: 1 }),
  service: serviceArb,
  confirmation: fc.option(fc.string(), { nil: undefined }),
  price: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
  currency: fc.option(fc.constantFrom('USD', 'EUR', 'GBP'), { nil: undefined }),
  checkin_time: fc.option(fc.constantFrom('15:00', '14:30'), { nil: undefined }),
  checkout_time: fc.option(fc.constantFrom('11:00', '10:00'), { nil: undefined }),
  dates: datesArb,
  notes: fc.string(),
  attachments: fc.array(fc.string({ minLength: 1 }), { maxLength: 3 }),
}).map(record => {
  const acc: Record<string, unknown> = {
    type: record.type,
    id: record.id,
    trip_id: record.trip_id,
    status: record.status,
    name: record.name,
    service: record.service,
    checkin: record.dates.checkin,
    checkout: record.dates.checkout,
    attachments: record.attachments,
    notes: record.notes,
  };
  if (record.confirmation) acc.confirmation = record.confirmation;
  if (record.price !== undefined) acc.price = record.price;
  if (record.currency) acc.currency = record.currency;
  if (record.checkin_time) acc.checkin_time = record.checkin_time;
  if (record.checkout_time) acc.checkout_time = record.checkout_time;
  return acc as unknown as Accommodation;
});

describe('Accommodation parser', () => {
  it('round-trips accommodations perfectly', () => {
    fc.assert(
      fc.property(accommodationArb, fc.string(), (acc, body) => {
        // Zod parser ensures we start with a valid accommodation
        const validAcc = Accommodation.parse(acc);
        
        // Serialize to markdown string
        const serialized = serializeAccommodation(validAcc, body);
        
        // Parse back to object
        const parsed = parseAccommodation(serialized);
        
        // Verify invariant
        expect(parsed.accommodation).toEqual(validAcc);
        // The body might be LF-normalized by the markdown parser, so we only compare if input was already LF
        const lfBody = body.replace(/\r\n/g, '\n');
        expect(parsed.body).toEqual(lfBody);
      }),
      { numRuns: 1000 }
    );
  });

  it('strips extra fields', () => {
    const base = Accommodation.parse(fc.sample(accommodationArb)[0]);
    const partial = { ...base, extra: 'field', confirmation: '123' };
    const md = serializeAccommodation(partial, '');
    const { accommodation: parsed } = parseAccommodation(md);
    
    // Check that standard fields are parsed
    expect(parsed.confirmation).toBe('123');
    // Check that extra fields are not part of the standard parsed object (zod drops them)
    expect((parsed as Record<string, unknown>).extra).toBeUndefined();
  });
});
