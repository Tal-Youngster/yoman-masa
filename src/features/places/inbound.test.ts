import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { newPlace } from '@/domain/place';
import { newTripId } from '@/domain/ids';
import { deleteDatabase, makeTestDb } from '@/lib/storage/test-helpers';
import type { TravelDB } from '@/lib/storage';
import { FakeDrive } from '@/sync/drive/fake';
import { InboundReconcilerRegistry, pullAll } from '@/sync/pull';

import { placeInboundReconciler } from './inbound';
import { serializePlace } from './parser';

let db: TravelDB;
beforeEach(() => {
  db = makeTestDb('place-inbound');
});
afterEach(async () => {
  db.close();
  await deleteDatabase(db.name);
});

const sample = newPlace({
  trip_id: newTripId(),
  place_id: 'ChIJ_test',
  place_alias: 'El Calafate viewpoint',
  category: 'view',
  lat: -50.34,
  lng: -72.27,
  notes: 'amazing sunset',
});

describe('placeInboundReconciler', () => {
  it('matchesPath: claims `Trips/<slug>/Places/*.md`', () => {
    expect(
      placeInboundReconciler.matchesPath('Trips/argentina/Places/calafate-viewpoint.md'),
    ).toBe(true);
    expect(placeInboundReconciler.matchesPath('Trips/x/Places/place.md')).toBe(true);
  });

  it('matchesPath: rejects look-alike paths', () => {
    expect(placeInboundReconciler.matchesPath('Trips/argentina/Trip.md')).toBe(false);
    expect(placeInboundReconciler.matchesPath('Places/x.md')).toBe(false);
    expect(placeInboundReconciler.matchesPath('Trips/Argentina/Places/x.md')).toBe(false);
    expect(placeInboundReconciler.matchesPath('Trips/x/Places/sub/x.md')).toBe(false);
  });

  it('parseFile: returns the parsed Place', () => {
    const md = serializePlace(sample, 'note body\n');
    const out = placeInboundReconciler.parseFile(md, 'Trips/argentina/Places/x.md');
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(sample);
  });

  it('parseFile: returns [] for files that aren’t Place content', () => {
    expect(placeInboundReconciler.parseFile('plain text', 'x')).toEqual([]);
    expect(placeInboundReconciler.parseFile('---\ntype: trip\nid: x\n---\n', 'x')).toEqual([]);
  });

  it('end-to-end: a vault place file appears in Dexie after pullAll', async () => {
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
    const placesFolder = drive.seedFolder({
      name: 'Places',
      parents: [slug],
      path: 'MyVault/Travel/Trips/argentina/Places',
    });
    drive.seedFile({
      name: 'calafate-viewpoint.md',
      parent: placesFolder,
      path: 'MyVault/Travel/Trips/argentina/Places/calafate-viewpoint.md',
      content: serializePlace(sample, ''),
    });

    const registry = new InboundReconcilerRegistry();
    registry.register(placeInboundReconciler);

    const report = await pullAll({
      drive,
      db,
      travelFolderId: drive.travelFolderId,
      registry,
    });

    expect(report.upserted).toBe(1);
    const stored = await db.places.get(sample.id);
    expect(stored).toEqual(sample);
  });
});
