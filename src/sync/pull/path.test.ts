import { describe, expect, it } from 'vitest';

import { FakeDrive } from '../drive/fake.js';

import { newPathCache, resolveRelativePath } from './path.js';

describe('resolveRelativePath', () => {
  it('returns the path relative to the Travel folder for a deep file', async () => {
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
    const fileId = drive.seedFile({
      name: 'Trip.md',
      parent: slug,
      path: 'MyVault/Travel/Trips/argentina/Trip.md',
      content: '---\ntype: trip\n---\n',
    });

    const file = await drive.getMetadata(fileId);
    const relPath = await resolveRelativePath(drive, drive.travelFolderId, file, newPathCache());

    expect(relPath).toBe('Trips/argentina/Trip.md');
  });

  it('returns null for a file outside the Travel folder', async () => {
    const drive = new FakeDrive();
    // Sibling folder under the vault root, not under Travel.
    const outside = drive.seedFolder({
      name: 'Junk',
      parents: [drive.rootFolderId],
      path: 'MyVault/Junk',
    });
    const fileId = drive.seedFile({
      name: 'random.md',
      parent: outside,
      path: 'MyVault/Junk/random.md',
      content: 'unrelated',
    });
    const file = await drive.getMetadata(fileId);
    const relPath = await resolveRelativePath(drive, drive.travelFolderId, file, newPathCache());
    expect(relPath).toBeNull();
  });

  it('memoizes ancestor lookups across calls sharing a cache', async () => {
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
    const f1 = drive.seedFile({
      name: 'Trip.md',
      parent: slug,
      path: 'MyVault/Travel/Trips/argentina/Trip.md',
      content: '',
    });
    const f2 = drive.seedFile({
      name: 'Notes.md',
      parent: slug,
      path: 'MyVault/Travel/Trips/argentina/Notes.md',
      content: '',
    });

    let getMetadataCalls = 0;
    const realGet = drive.getMetadata.bind(drive);
    drive.getMetadata = (id) => {
      getMetadataCalls += 1;
      return realGet(id);
    };

    const cache = newPathCache();
    await resolveRelativePath(drive, drive.travelFolderId, await realGet(f1), cache);
    const before = getMetadataCalls;
    await resolveRelativePath(drive, drive.travelFolderId, await realGet(f2), cache);

    // The second call walks the same Trips → argentina chain — both ancestors
    // should be served from cache, so no new getMetadata calls.
    expect(getMetadataCalls).toBe(before);
  });
});
