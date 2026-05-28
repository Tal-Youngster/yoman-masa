import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isoDate } from '@/domain/dates';
import { currency } from '@/domain/money';
import { newTrip } from '@/domain/trip';
import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';
import type { TravelDB } from '@/lib/storage';
import { FakeDrive } from '@/sync/drive/fake';
import {
  InboundReconcilerRegistry,
  pullAll,
} from '@/sync/pull';

import { tripInboundReconciler } from './inbound';
import { serializeTrip } from './parser';

let db: TravelDB;
beforeEach(() => {
  db = makeTestDb('trips-inbound');
});
afterEach(async () => {
  db.close();
  await deleteDatabase(db.name);
});

const sample = newTrip({
  slug: 'argentina-2026',
  name: 'Argentina 2026',
  start_date: isoDate('2026-11-01'),
  end_date: isoDate('2026-11-21'),
  home_currency: currency('USD'),
});

describe('tripInboundReconciler', () => {
  it('matchesPath: claims `Trips/<slug>/Trip.md`', () => {
    expect(tripInboundReconciler.matchesPath('Trips/argentina-2026/Trip.md')).toBe(true);
    expect(tripInboundReconciler.matchesPath('Trips/x/Trip.md')).toBe(true);
  });

  it('matchesPath: rejects paths that look close but are wrong', () => {
    expect(tripInboundReconciler.matchesPath('Trips/Trip.md')).toBe(false);
    expect(tripInboundReconciler.matchesPath('Trips/argentina/notes.md')).toBe(false);
    expect(tripInboundReconciler.matchesPath('Trips/Argentina/Trip.md')).toBe(false); // uppercase slug
    expect(tripInboundReconciler.matchesPath('Accommodations/x/Trip.md')).toBe(false);
    expect(tripInboundReconciler.matchesPath('Trips/argentina/Trip.md.bak')).toBe(false);
  });

  it('parseFile: returns the parsed Trip', () => {
    const md = serializeTrip(sample, 'My notes\n');
    const out = tripInboundReconciler.parseFile(md, 'Trips/argentina-2026/Trip.md');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(sample);
  });

  it('parseFile: returns [] for files that aren’t Trip.md content', () => {
    expect(tripInboundReconciler.parseFile('plain text', 'x')).toEqual([]);
    expect(
      tripInboundReconciler.parseFile('---\ntype: accommodation\nname: x\n---\n', 'x'),
    ).toEqual([]);
  });

  it('end-to-end: a Trip.md created externally appears in Dexie after pullAll', async () => {
    const drive = new FakeDrive();
    const trips = drive.seedFolder({
      name: 'Trips',
      parents: [drive.travelFolderId],
      path: 'MyVault/Travel/Trips',
    });
    const slug = drive.seedFolder({
      name: sample.slug,
      parents: [trips],
      path: `MyVault/Travel/Trips/${sample.slug}`,
    });
    drive.seedFile({
      name: 'Trip.md',
      parent: slug,
      path: `MyVault/Travel/Trips/${sample.slug}/Trip.md`,
      content: serializeTrip(sample, ''),
    });

    const registry = new InboundReconcilerRegistry();
    registry.register(tripInboundReconciler);
    const report = await pullAll({
      drive,
      db,
      travelFolderId: drive.travelFolderId,
      registry,
    });

    expect(report.upserted).toBe(1);
    const stored = await db.trips.get(sample.id);
    expect(stored).toEqual(sample);
  });
});
