import { describe, expect, it } from 'vitest';

import { FakeDrive } from './fake.js';
import { WriteOutOfScopeError } from './types.js';

describe('FakeDrive', () => {
  it('seeds root and Travel folders with correct paths', async () => {
    const drive = new FakeDrive();
    const root = await drive.getMetadata(drive.rootFolderId);
    const travel = await drive.getMetadata(drive.travelFolderId);
    expect(root.path).toBe('MyVault');
    expect(travel.path).toBe('MyVault/Travel');
    expect(travel.isFolder).toBe(true);
    expect(travel.parents).toEqual([drive.rootFolderId]);
  });

  it('creates files under the Travel folder', async () => {
    const drive = new FakeDrive();
    const created = await drive.createFile({
      parentId: drive.travelFolderId,
      name: 'Trip.md',
      content: '# hello',
      mimeType: 'text/markdown',
      resolvedPath: 'MyVault/Travel/Trips/japan-2026/Trip.md',
    });
    expect(created.path).toBe('MyVault/Travel/Trips/japan-2026/Trip.md');
    const { content, revision } = await drive.getContent(created.id);
    expect(content).toBe('# hello');
    expect(revision).toBe(created.headRevisionId);
  });

  it('rejects creates outside WRITE_ALLOWED_PREFIX', async () => {
    const drive = new FakeDrive();
    await expect(
      drive.createFile({
        parentId: drive.rootFolderId,
        name: 'evil.md',
        content: '',
        mimeType: 'text/markdown',
        resolvedPath: 'MyVault/Other/evil.md',
      }),
    ).rejects.toBeInstanceOf(WriteOutOfScopeError);
  });

  it('rejects updates outside WRITE_ALLOWED_PREFIX', async () => {
    const drive = new FakeDrive();
    const id = drive.seedFile({
      name: 'mine.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/mine.md',
      content: 'orig',
    });
    await expect(
      drive.updateFile({
        id,
        content: 'mutated',
        resolvedPath: 'MyVault/Outside/mine.md',
      }),
    ).rejects.toBeInstanceOf(WriteOutOfScopeError);
  });

  it('bumps revision and modifiedTime on update', async () => {
    const drive = new FakeDrive();
    const id = drive.seedFile({
      name: 'a.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/a.md',
      content: 'v1',
    });
    const before = await drive.getMetadata(id);
    const after = await drive.updateFile({
      id,
      content: 'v2',
      resolvedPath: 'MyVault/Travel/a.md',
    });
    expect(after.headRevisionId).not.toBe(before.headRevisionId);
    expect(after.modifiedTime > before.modifiedTime).toBe(true);
  });

  it('externalEdit simulates a third-party write', async () => {
    const drive = new FakeDrive();
    const id = drive.seedFile({
      name: 'a.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/a.md',
      content: 'v1',
    });
    const r1 = (await drive.getMetadata(id)).headRevisionId;
    drive.externalEdit(id, 'obsidian wrote me');
    const { content, revision } = await drive.getContent(id);
    expect(content).toBe('obsidian wrote me');
    expect(revision).not.toBe(r1);
  });

  it('listFolder returns children', async () => {
    const drive = new FakeDrive();
    drive.seedFile({
      name: 'a.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/a.md',
      content: '',
    });
    drive.seedFile({
      name: 'b.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/b.md',
      content: '',
    });
    const children = await drive.listFolder(drive.travelFolderId);
    expect(children.map((c) => c.name).sort()).toEqual(['a.md', 'b.md']);
  });

  it('getChanges paginates from a token', async () => {
    const drive = new FakeDrive();
    const token0 = await drive.startChangeToken();
    drive.seedFile({
      name: 'c.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/c.md',
      content: '',
    });
    const batch = await drive.getChanges(token0);
    expect(batch.changes.length).toBe(1);
    expect(batch.changes[0].removed).toBe(false);
    // Single short page => caught up, so Drive hands back newStartPageToken
    // (not nextPageToken). That distinction is what lets the cursor advance.
    expect(batch.nextPageToken).toBeNull();
    expect(batch.newStartPageToken).not.toBeNull();
    const empty = await drive.getChanges(batch.newStartPageToken!);
    expect(empty.changes.length).toBe(0);
  });

  it('externalRemove records a removal change', async () => {
    const drive = new FakeDrive();
    const id = drive.seedFile({
      name: 'x.md',
      parent: drive.travelFolderId,
      path: 'MyVault/Travel/x.md',
      content: '',
    });
    const token = await drive.startChangeToken();
    drive.externalRemove(id);
    const batch = await drive.getChanges(token);
    expect(batch.changes.at(-1)).toMatchObject({ fileId: id, removed: true, file: null });
  });
});
