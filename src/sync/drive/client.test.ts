/**
 * `RealDriveClient.getChanges` against an injected `fetch`.
 *
 * These exist because the original sync hang lived here and nothing covered
 * it: `FakeDrive` implemented a *correct* change feed, so every pull test
 * passed while the real client silently never advanced its cursor. Testing
 * the real client's request shape and response decoding is the only thing
 * that would have caught it.
 */

import { describe, expect, it, vi } from 'vitest';

import { RealDriveClient } from './client.js';
import { asFileId, DriveApiError, InvalidPageTokenError } from './types.js';
import type { DriveAuth } from './auth.js';

const auth = { getAccessToken: () => Promise.resolve('tok') } as unknown as DriveAuth;

function makeClient(fetchImpl: typeof fetch): RealDriveClient {
  return new RealDriveClient({
    auth,
    allowedPrefix: 'MyVault/Travel',
    resolvePath: () => Promise.resolve('MyVault/Travel'),
    fetchImpl,
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response;
}

describe('RealDriveClient.getChanges', () => {
  /**
   * The regression test for ADR-0019. Drive returns only the fields named in
   * the mask; `newStartPageToken` was missing from it, so the "we are caught
   * up, here is your next cursor" signal never arrived and the pull worker
   * re-persisted the cursor it already had. Every subsequent pull then
   * replayed an unboundedly growing window of changes.
   */
  it('requests newStartPageToken in the fields mask', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ changes: [] }));
    await makeClient(fetchImpl as never).getChanges('t0');

    const url = String(fetchImpl.mock.calls[0]?.[0]);
    const fields = new URL(url).searchParams.get('fields') ?? '';
    expect(fields).toContain('newStartPageToken');
    expect(fields).toContain('nextPageToken');
  });

  it('reports "more pages" and "caught up" as distinct tokens', async () => {
    const more = makeClient(
      vi.fn().mockResolvedValue(jsonResponse({ nextPageToken: 'p2', changes: [] })) as never,
    );
    await expect(more.getChanges('p1')).resolves.toMatchObject({
      nextPageToken: 'p2',
      newStartPageToken: null,
    });

    const done = makeClient(
      vi.fn().mockResolvedValue(jsonResponse({ newStartPageToken: 'p9', changes: [] })) as never,
    );
    await expect(done.getChanges('p1')).resolves.toMatchObject({
      nextPageToken: null,
      newStartPageToken: 'p9',
    });
  });

  it('never echoes the caller’s own token back as progress', async () => {
    // A page carrying neither token must not resolve to `pageToken`. That
    // fallback is what made "no progress" indistinguishable from progress.
    const client = makeClient(
      vi.fn().mockResolvedValue(jsonResponse({ changes: [] })) as never,
    );
    const batch = await client.getChanges('t-current');
    expect(batch.nextPageToken).toBeNull();
    expect(batch.newStartPageToken).toBeNull();
  });

  it('surfaces a rejected token as InvalidPageTokenError so the caller can backfill', async () => {
    for (const status of [404, 410]) {
      const client = makeClient(
        vi.fn().mockResolvedValue(jsonResponse({ error: 'bad token' }, status)) as never,
      );
      await expect(client.getChanges('stale')).rejects.toBeInstanceOf(InvalidPageTokenError);
    }
  });

  it('leaves other API failures as DriveApiError', async () => {
    const client = makeClient(
      vi.fn().mockResolvedValue(jsonResponse({ error: 'boom' }, 500)) as never,
    );
    await expect(client.getChanges('t0')).rejects.toBeInstanceOf(DriveApiError);
  });

  it('decodes removals and files', async () => {
    const client = makeClient(
      vi.fn().mockResolvedValue(
        jsonResponse({
          newStartPageToken: 'p9',
          changes: [
            { fileId: 'gone', removed: true },
            {
              fileId: 'kept',
              file: {
                id: 'kept',
                name: 'Trip.md',
                parents: ['fld'],
                mimeType: 'text/markdown',
                headRevisionId: 'rev-1',
                modifiedTime: '2026-08-01T00:00:00Z',
              },
            },
          ],
        }),
      ) as never,
    );

    const batch = await client.getChanges('t0');
    expect(batch.changes).toHaveLength(2);
    expect(batch.changes[0]).toMatchObject({ fileId: asFileId('gone'), removed: true, file: null });
    expect(batch.changes[1]?.removed).toBe(false);
    expect(batch.changes[1]?.file?.headRevisionId).toBe('rev-1');
  });
});
