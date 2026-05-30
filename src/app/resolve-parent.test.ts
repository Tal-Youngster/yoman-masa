import { beforeEach, describe, expect, it } from 'vitest';

import { FakeDrive } from '@/sync/drive';

import { resolveParent, stripPrefix } from './resolve-parent';

describe('stripPrefix', () => {
  it('removes the leading prefix segment when it matches', () => {
    expect(stripPrefix('Travel/Trips/argentina/Trip.md', 'Travel')).toEqual([
      'Trips',
      'argentina',
      'Trip.md',
    ]);
  });

  it('leaves the path alone if the prefix does not match the first segment', () => {
    expect(stripPrefix('Other/Trips/argentina/Trip.md', 'Travel')).toEqual([
      'Other',
      'Trips',
      'argentina',
      'Trip.md',
    ]);
  });

  it('drops empty segments from leading/trailing/double slashes', () => {
    expect(stripPrefix('/Travel//Trips/argentina/Trip.md', 'Travel')).toEqual([
      'Trips',
      'argentina',
      'Trip.md',
    ]);
  });

  it('handles a single-segment file directly under the prefix', () => {
    expect(stripPrefix('Travel/Trip.md', 'Travel')).toEqual(['Trip.md']);
  });
});

describe('resolveParent', () => {
  let drive: FakeDrive;
  let travelFolderId: string;
  let folderCache: Map<string, string>;

  beforeEach(() => {
    // FakeDrive seeds a root and a `Travel` folder under it. We treat that
    // Travel folder as the user's pick — the same way main.tsx wires the real
    // client to whatever folder the Picker returned.
    drive = new FakeDrive();
    travelFolderId = drive.travelFolderId;
    folderCache = new Map();
  });

  it('places `Travel/Trips/<slug>/Trip.md` under the picked Travel folder — NOT a nested Travel/', async () => {
    const parent = await resolveParent(
      { entityType: 'trip', resolvedPath: 'Travel/Trips/argentina/Trip.md' },
      { drive, travelFolderId, allowedPrefix: 'Travel', folderCache },
    );

    expect(parent).not.toBeNull();

    // The picked Travel folder's direct children should be `Trips/` only —
    // a nested `Travel/` would be the regression we're fixing.
    const travelChildren = await drive.listFolder(drive.travelFolderId);
    const childNames = travelChildren.map((c) => c.name).sort();
    expect(childNames).toContain('Trips');
    expect(childNames).not.toContain('Travel');

    // And the resolved parent should be the `argentina` folder, which sits two
    // levels below the picked Travel folder, not three.
    const trips = travelChildren.find((c) => c.name === 'Trips');
    expect(trips).toBeDefined();
    const tripsChildren = await drive.listFolder(trips!.id);
    expect(tripsChildren.map((c) => c.name)).toEqual(['argentina']);
    expect(parent).toBe(tripsChildren[0]?.id);
  });

  it('returns the picked Travel folder id directly for a single-segment file like .travel/config.json', async () => {
    // `.travel/config.json` resolves to `Travel/.travel/config.json` →
    // segments after strip = ['.travel', 'config.json'] → one folder name.
    const parent = await resolveParent(
      { entityType: 'active_config', resolvedPath: 'Travel/.travel/config.json' },
      { drive, travelFolderId, allowedPrefix: 'Travel', folderCache },
    );
    expect(parent).not.toBeNull();
    // The `.travel/` folder should now exist directly under the picked Travel
    // folder, not under a duplicated `Travel/` layer.
    const travelChildren = await drive.listFolder(drive.travelFolderId);
    expect(travelChildren.map((c) => c.name)).toContain('.travel');
    expect(travelChildren.map((c) => c.name)).not.toContain('Travel');
  });

  it('reuses existing folders across calls and does not double-create them', async () => {
    await resolveParent(
      { entityType: 'trip', resolvedPath: 'Travel/Trips/argentina/Trip.md' },
      { drive, travelFolderId, allowedPrefix: 'Travel', folderCache },
    );
    await resolveParent(
      { entityType: 'trip', resolvedPath: 'Travel/Trips/japan/Trip.md' },
      { drive, travelFolderId, allowedPrefix: 'Travel', folderCache },
    );

    const travelChildren = await drive.listFolder(drive.travelFolderId);
    expect(travelChildren.filter((c) => c.name === 'Trips')).toHaveLength(1);
    const trips = travelChildren.find((c) => c.name === 'Trips')!;
    const tripsChildren = await drive.listFolder(trips.id);
    expect(tripsChildren.map((c) => c.name).sort()).toEqual(['argentina', 'japan']);
  });

  it('returns null when the Travel folder is not configured (caller routes to blocked)', async () => {
    const parent = await resolveParent(
      { entityType: 'trip', resolvedPath: 'Travel/Trips/x/Trip.md' },
      { drive, travelFolderId: '', allowedPrefix: 'Travel', folderCache },
    );
    expect(parent).toBeNull();
  });

  it('still rediscovers existing folders without a cache (e.g. across page reloads)', async () => {
    // Pre-create the Trips folder out-of-band, then call resolveParent with a
    // fresh cache. It should find — not duplicate — the existing folder.
    await drive.createFolder(drive.travelFolderId, 'Trips');

    const parent = await resolveParent(
      { entityType: 'trip', resolvedPath: 'Travel/Trips/x/Trip.md' },
      {
        drive,
        travelFolderId,
        allowedPrefix: 'Travel',
        folderCache: new Map(),
      },
    );
    expect(parent).not.toBeNull();
    const travelChildren = await drive.listFolder(drive.travelFolderId);
    expect(travelChildren.filter((c) => c.name === 'Trips')).toHaveLength(1);
  });
});
