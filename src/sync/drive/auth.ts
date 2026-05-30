/**
 * GIS implicit token client wrapper (ADR-0003).
 *
 * Strategy:
 *  - Load the GIS script (`https://accounts.google.com/gsi/client`) on demand.
 *  - Initialize a token client and request tokens with `prompt: ''` for silent
 *    refresh.
 *  - Tokens live ~1h. Caller invokes `getAccessToken` and we cache the latest
 *    fresh token in memory. Refresh is request-on-demand (lazy, on the next call
 *    that finds an expired token) — there is no focus listener; concurrent
 *    refreshes are collapsed into one request to avoid a popup storm.
 *  - Optionally persist the still-valid access token via `AuthPersistence` so
 *    page refreshes don't have to round-trip GIS. ADR-0003 forbids storing
 *    *refresh* tokens client-side; the short-lived access token is fair game.
 *    Also persist the user's email after one userinfo lookup and feed it back
 *    as `loginHint` so subsequent silent refreshes don't pop an account picker.
 *  - Surface a `reconnect-required` AuthEvent when silent re-auth fails (e.g.
 *    incognito). Don't throw — the UI subscribes and renders a "Reconnect Drive"
 *    prompt.
 *
 * NOTE: This module is browser-only at runtime. It compiles in Node but the
 * exported functions guard against missing globals.
 */

import { ReauthRequiredError, type AuthEvent } from './types.js';
import type { GisTokenClient, GisTokenResponse } from './google-globals.js';

export interface AuthConfig {
  /** OAuth client id from Google Cloud console. */
  clientId: string;
  /** Space-separated scopes. Defaults to the ADR-0003 set. */
  scope?: string;
  /** Hint email for `prompt: ''`. Helps the silent flow match the right account. */
  loginHint?: string;
  /**
   * Optional persistent store for the access token and the login hint. Both are
   * sync — backed by `localStorage` in the app. Omit in tests / SSR.
   */
  persistence?: AuthPersistence;
  /**
   * Override the userinfo fetch (used in tests). Defaults to a fetch against
   * Google's v3 userinfo endpoint with the bearer token. Returns the user's
   * email (or null if it can't be determined). Failures are swallowed.
   */
  fetchUserEmail?: (accessToken: string) => Promise<string | null>;
}

/**
 * Token and login-hint persistence. Sync API on purpose: backed by
 * `localStorage` it lets us hydrate the in-memory cache in the constructor
 * without an async dance before the first `getAccessToken`.
 */
export interface AuthPersistence {
  loadToken(): CachedToken | null;
  saveToken(token: CachedToken | null): void;
  loadHint(): string | null;
  saveHint(hint: string): void;
}

const DEFAULT_SCOPE = 'https://www.googleapis.com/auth/drive openid email profile';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export type AuthEventListener = (event: AuthEvent) => void;

async function defaultFetchUserEmail(accessToken: string): Promise<string | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const resp = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { email?: unknown };
    return typeof json.email === 'string' ? json.email : null;
  } catch {
    return null;
  }
}

/**
 * Drive auth context. One instance per app. `getAccessToken` returns a usable
 * token, transparently refreshing when expired.
 */
export class DriveAuth {
  private readonly clientId: string;
  private readonly scope: string;
  private loginHint: string | undefined;
  private readonly persistence: AuthPersistence | null;
  private readonly fetchUserEmail: (token: string) => Promise<string | null>;
  private cached: CachedToken | null = null;
  private tokenClient: GisTokenClient | null = null;
  private pendingResolve: ((token: string) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private inflight: Promise<string> | null = null;
  private readonly listeners = new Set<AuthEventListener>();

  constructor(config: AuthConfig) {
    this.clientId = config.clientId;
    this.scope = config.scope ?? DEFAULT_SCOPE;
    this.persistence = config.persistence ?? null;
    this.fetchUserEmail = config.fetchUserEmail ?? defaultFetchUserEmail;

    // Hydrate hint first so an early request uses it. Explicit config wins.
    this.loginHint = config.loginHint ?? this.persistence?.loadHint() ?? undefined;

    // Hydrate the cached token if it's still comfortably valid. Same 60s buffer
    // as `getAccessToken` so we don't restore a token that's about to be tossed.
    const persisted = this.persistence?.loadToken() ?? null;
    if (persisted && persisted.expiresAt - Date.now() > 60_000) {
      this.cached = persisted;
    } else if (persisted) {
      // Expired / about-to-expire — clear so we don't keep reading stale rows.
      this.persistence?.saveToken(null);
    }
  }

  /** Returns a valid access token. Refreshes if expired. */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    // 60s buffer to avoid using an about-to-expire token.
    if (this.cached && this.cached.expiresAt - now > 60_000) {
      return this.cached.accessToken;
    }
    return this.requestNewToken({ silent: true });
  }

  /** Force an interactive re-auth (user clicked "Reconnect Drive"). */
  async reauthenticateInteractive(): Promise<string> {
    return this.requestNewToken({ silent: false });
  }

  /** Subscribe to auth lifecycle events. Returns an unsubscribe handle. */
  onEvent(listener: AuthEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AuthEvent): void {
    for (const l of this.listeners) l(event);
  }

  private async ensureGisLoaded(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new ReauthRequiredError('GIS unavailable outside browser context');
    }
    if (window.google?.accounts?.oauth2) return;
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SCRIPT_URL}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('GIS load failed')), {
          once: true,
        });
        return;
      }
      const script = document.createElement('script');
      script.src = GIS_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => reject(new Error('GIS load failed')), {
        once: true,
      });
      document.head.appendChild(script);
    });
  }

  private async ensureTokenClient(): Promise<GisTokenClient> {
    await this.ensureGisLoaded();
    if (this.tokenClient) return this.tokenClient;
    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      throw new ReauthRequiredError('Google Identity Services failed to initialize');
    }
    this.tokenClient = oauth2.initTokenClient({
      client_id: this.clientId,
      scope: this.scope,
      callback: (resp) => this.handleResponse(resp),
    });
    return this.tokenClient;
  }

  private handleResponse(resp: GisTokenResponse): void {
    if (resp.error || !resp.access_token) {
      const reason = resp.error_description ?? resp.error ?? 'unknown';
      this.emit({ type: 'reconnect-required', reason });
      this.pendingReject?.(new ReauthRequiredError(reason));
      this.pendingReject = null;
      this.pendingResolve = null;
      return;
    }
    const expiresAt = Date.now() + (resp.expires_in ?? 3600) * 1000;
    this.cached = { accessToken: resp.access_token, expiresAt };
    this.persistence?.saveToken(this.cached);
    this.emit({ type: 'token-acquired', expiresAt });
    this.pendingResolve?.(resp.access_token);
    this.pendingResolve = null;
    this.pendingReject = null;
    // First-time hint capture — fire-and-forget so we don't delay the caller.
    if (!this.loginHint) void this.captureLoginHint(resp.access_token);
  }

  private async captureLoginHint(accessToken: string): Promise<void> {
    const email = await this.fetchUserEmail(accessToken);
    if (!email) return;
    this.loginHint = email;
    this.persistence?.saveHint(email);
  }

  private requestNewToken({ silent }: { silent: boolean }): Promise<string> {
    // GIS opens an auth flow per `requestAccessToken()` call. Concurrent Drive
    // requests hitting a cold/expired token would each open one, producing a
    // storm of popups — collapse them into a single outstanding request. This
    // also keeps `pendingResolve`/`pendingReject` (single slots) coherent.
    if (this.inflight) return this.inflight;
    const promise = (async () => {
      const client = await this.ensureTokenClient();
      return new Promise<string>((resolve, reject) => {
        this.pendingResolve = resolve;
        this.pendingReject = reject;
        const opts: { prompt?: string; hint?: string } = {};
        if (silent) opts.prompt = '';
        if (this.loginHint) opts.hint = this.loginHint;
        client.requestAccessToken(opts);
      });
    })();
    this.inflight = promise;
    void promise.then(
      () => {
        this.inflight = null;
      },
      () => {
        this.inflight = null;
      },
    );
    return promise;
  }
}
