// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DriveAuth, type AuthPersistence } from './auth.js';
import type { GisTokenResponse } from './google-globals.js';

function makeMemoryPersistence(
  initial: { token?: { accessToken: string; expiresAt: number }; hint?: string } = {},
): AuthPersistence & { token: typeof initial.token; hint: typeof initial.hint } {
  const store = {
    token: initial.token,
    hint: initial.hint,
    loadToken: () => store.token ?? null,
    saveToken: (t: { accessToken: string; expiresAt: number } | null) => {
      store.token = t ?? undefined;
    },
    loadHint: () => store.hint ?? null,
    saveHint: (h: string) => {
      store.hint = h;
    },
  };
  return store;
}

/**
 * Installs a fake GIS oauth2 namespace on `window` and returns handles to
 * drive the token callback. `ensureGisLoaded` short-circuits when
 * `window.google.accounts.oauth2` is already present, so no script load runs.
 */
function installGis() {
  let capturedCallback: ((resp: GisTokenResponse) => void) | null = null;
  const requestAccessToken = vi.fn();
  const initTokenClient = vi.fn((opts: { callback: (resp: GisTokenResponse) => void }) => {
    capturedCallback = opts.callback;
    return { requestAccessToken, callback: opts.callback };
  });
  (window as unknown as { google: unknown }).google = {
    accounts: { oauth2: { initTokenClient } },
  };
  return {
    requestAccessToken,
    initTokenClient,
    respond: (resp: GisTokenResponse) => {
      if (!capturedCallback) throw new Error('token client callback not registered');
      capturedCallback(resp);
    },
  };
}

afterEach(() => {
  delete (window as unknown as { google?: unknown }).google;
});

describe('DriveAuth token requests', () => {
  it('collapses concurrent getAccessToken calls into a single GIS request', async () => {
    const gis = installGis();
    const auth = new DriveAuth({ clientId: 'cid' });

    const pending = [auth.getAccessToken(), auth.getAccessToken(), auth.getAccessToken()];
    await vi.waitFor(() => expect(gis.requestAccessToken).toHaveBeenCalledTimes(1));

    gis.respond({ access_token: 'tok-1', expires_in: 3600 });

    expect(await Promise.all(pending)).toEqual(['tok-1', 'tok-1', 'tok-1']);
    expect(gis.requestAccessToken).toHaveBeenCalledTimes(1);
    // One client is initialized and reused, not one per caller.
    expect(gis.initTokenClient).toHaveBeenCalledTimes(1);
  });

  it('serves a still-valid cached token without re-prompting', async () => {
    const gis = installGis();
    const auth = new DriveAuth({ clientId: 'cid' });

    const first = auth.getAccessToken();
    await vi.waitFor(() => expect(gis.requestAccessToken).toHaveBeenCalledTimes(1));
    gis.respond({ access_token: 'tok-1', expires_in: 3600 });
    await first;

    expect(await auth.getAccessToken()).toBe('tok-1');
    expect(gis.requestAccessToken).toHaveBeenCalledTimes(1);
  });

  it('clears the in-flight guard after a failure so a later attempt re-prompts', async () => {
    const gis = installGis();
    const auth = new DriveAuth({ clientId: 'cid' });

    const first = auth.getAccessToken();
    await vi.waitFor(() => expect(gis.requestAccessToken).toHaveBeenCalledTimes(1));
    gis.respond({ error: 'access_denied' });
    await expect(first).rejects.toThrow(/access_denied/);

    const second = auth.getAccessToken();
    await vi.waitFor(() => expect(gis.requestAccessToken).toHaveBeenCalledTimes(2));
    gis.respond({ access_token: 'tok-2', expires_in: 3600 });
    await expect(second).resolves.toBe('tok-2');
  });

  it('surfaces a reconnect-required event when silent auth fails', async () => {
    const gis = installGis();
    const auth = new DriveAuth({ clientId: 'cid' });
    const events: string[] = [];
    auth.onEvent((e) => events.push(e.type));

    const p = auth.getAccessToken();
    await vi.waitFor(() => expect(gis.requestAccessToken).toHaveBeenCalledTimes(1));
    gis.respond({ error: 'interaction_required', error_description: 'needs consent' });
    await expect(p).rejects.toThrow(/needs consent/);

    expect(events).toContain('reconnect-required');
  });
});

describe('DriveAuth persistence', () => {
  it('hydrates from a still-valid persisted token without prompting', async () => {
    const gis = installGis();
    const persistence = makeMemoryPersistence({
      token: { accessToken: 'persisted', expiresAt: Date.now() + 30 * 60_000 },
    });
    const auth = new DriveAuth({ clientId: 'cid', persistence });

    expect(await auth.getAccessToken()).toBe('persisted');
    expect(gis.requestAccessToken).not.toHaveBeenCalled();
  });

  it('discards an expired persisted token and clears it from storage', async () => {
    const gis = installGis();
    const persistence = makeMemoryPersistence({
      token: { accessToken: 'stale', expiresAt: Date.now() - 1_000 },
    });
    const auth = new DriveAuth({
      clientId: 'cid',
      persistence,
      fetchUserEmail: () => Promise.resolve(null),
    });

    expect(persistence.token).toBeUndefined();

    const p = auth.getAccessToken();
    await vi.waitFor(() => expect(gis.requestAccessToken).toHaveBeenCalledTimes(1));
    gis.respond({ access_token: 'fresh', expires_in: 3600 });
    expect(await p).toBe('fresh');
  });

  it('persists newly acquired tokens', async () => {
    const gis = installGis();
    const persistence = makeMemoryPersistence();
    const auth = new DriveAuth({
      clientId: 'cid',
      persistence,
      fetchUserEmail: () => Promise.resolve(null),
    });

    const p = auth.getAccessToken();
    await vi.waitFor(() => expect(gis.requestAccessToken).toHaveBeenCalledTimes(1));
    gis.respond({ access_token: 'tok', expires_in: 3600 });
    await p;

    expect(persistence.token?.accessToken).toBe('tok');
    expect(persistence.token?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('feeds a persisted login hint into the first silent request', async () => {
    const gis = installGis();
    const persistence = makeMemoryPersistence({ hint: 'me@example.com' });
    const auth = new DriveAuth({ clientId: 'cid', persistence });

    void auth.getAccessToken();
    await vi.waitFor(() => expect(gis.requestAccessToken).toHaveBeenCalledTimes(1));

    expect(gis.requestAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ hint: 'me@example.com', prompt: '' }),
    );
  });

  it('captures the user email on first token and uses it on the next silent request', async () => {
    const gis = installGis();
    const persistence = makeMemoryPersistence();
    const fetchUserEmail = vi.fn(() => Promise.resolve<string | null>('captured@example.com'));
    const auth = new DriveAuth({ clientId: 'cid', persistence, fetchUserEmail });

    // First request — no hint yet.
    const first = auth.getAccessToken();
    await vi.waitFor(() => expect(gis.requestAccessToken).toHaveBeenCalledTimes(1));
    const firstCallArgs = gis.requestAccessToken.mock.calls.at(-1)?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(firstCallArgs?.['hint']).toBeUndefined();
    expect(firstCallArgs?.['prompt']).toBe('');
    gis.respond({ access_token: 'tok-1', expires_in: 3600 });
    await first;
    await vi.waitFor(() => expect(persistence.hint).toBe('captured@example.com'));

    // Force the token to expire so the next call re-requests.
    persistence.saveToken({
      accessToken: 'tok-1',
      expiresAt: Date.now() - 1_000,
    });
    // The in-memory cache is also stale — simulate by mutating directly.
    (auth as unknown as { cached: { accessToken: string; expiresAt: number } | null }).cached =
      null;

    const second = auth.getAccessToken();
    await vi.waitFor(() => expect(gis.requestAccessToken).toHaveBeenCalledTimes(2));
    expect(gis.requestAccessToken).toHaveBeenLastCalledWith(
      expect.objectContaining({ hint: 'captured@example.com', prompt: '' }),
    );
    gis.respond({ access_token: 'tok-2', expires_in: 3600 });
    await second;
  });
});
