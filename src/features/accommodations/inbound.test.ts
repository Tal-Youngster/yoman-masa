import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isoDate } from '@/domain/dates';
import { newAccommodation } from '@/domain/accommodation';
import { newTripId } from '@/domain/ids';
import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';
import type { TravelDB } from '@/lib/storage';
import { FakeDrive } from '@/sync/drive/fake';
import { InboundReconcilerRegistry, pullAll } from '@/sync/pull';

import { accommodationInboundReconciler } from './inbound';
import { serializeAccommodation } from './parser';

let db: TravelDB;
beforeEach(() => {
  db = makeTestDb('acc-inbound');
});
afterEach(async () => {
  db.close();
  await deleteDatabase(db.name);
});

const sample = newAccommodation({
  trip_id: newTripId(),
  status: 'booked',
  name: 'Mendoza B&B',
  service: 'booking',
  checkin: isoDate('2026-11-04'),
  checkout: isoDate('2026-11-07'),
});

describe('accommodationInboundReconciler', () => {
  it('matchesPath: claims `Trips/<slug>/Accommodations/*.md`', () => {
    expect(
      accommodationInboundReconciler.matchesPath(
        'Trips/argentina/Accommodations/2026-11-04-mendoza.md',
      ),
    ).toBe(true);
    expect(
      accommodationInboundReconciler.matchesPath('Trips/x/Accommodations/acc.md'),
    ).toBe(true);
  });

  it('matchesPath: rejects paths that look close but are wrong', () => {
    expect(accommodationInboundReconciler.matchesPath('Trips/argentina/Trip.md')).toBe(false);
    expect(
      accommodationInboundReconciler.matchesPath('Accommodations/x.md'),
    ).toBe(false);
    expect(
      accommodationInboundReconciler.matchesPath('Trips/Argentina/Accommodations/x.md'),
    ).toBe(false); // uppercase slug
    expect(
      accommodationInboundReconciler.matchesPath('Trips/x/Accommodations/sub/x.md'),
    ).toBe(false); // nested
  });

  it('parseFile: returns the parsed Accommodation', () => {
    const md = serializeAccommodation(sample, 'My notes\n');
    const out = accommodationInboundReconciler.parseFile(
      md,
      'Trips/argentina/Accommodations/2026-11-04-mendoza.md',
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(sample);
  });

  it('parseFile: returns [] for unrelated content', () => {
    expect(accommodationInboundReconciler.parseFile('plain text', 'x')).toEqual([]);
    expect(
      accommodationInboundReconciler.parseFile('---\ntype: trip\nid: x\n---\n', 'x'),
    ).toEqual([]);
  });

  it('end-to-end: a vault accommodation file appears in Dexie after pullAll', async () => {
    const drive = new FakeDrive();
    const trips = drive.seedFolder({
      name: 'Trips',
      parents: [drive.travelFolderId],
      path: 'MyVault/Travel/Trips',
    });
    const slug = drive.seedFolder({
      name: 'argentina',
      parents: [trips],
      path: 'MyVault/Travel/Trips/argentina',
    });
    const accFolder = drive.seedFolder({
      name: 'Accommodations',
      parents: [slug],
      path: 'MyVault/Travel/Trips/argentina/Accommodations',
    });
    drive.seedFile({
      name: '2026-11-04-mendoza.md',
      parent: accFolder,
      path: 'MyVault/Travel/Trips/argentina/Accommodations/2026-11-04-mendoza.md',
      content: serializeAccommodation(sample, ''),
    });

    const registry = new InboundReconcilerRegistry();
    registry.register(accommodationInboundReconciler);

    const report = await pullAll({
      drive,
      db,
      travelFolderId: drive.travelFolderId,
      registry,
    });

    expect(report.upserted).toBe(1);
    const stored = await db.accommodations.get(sample.id);
    expect(stored).toEqual(sample);
  });
});
