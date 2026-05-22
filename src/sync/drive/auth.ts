/**
 * GIS implicit token client wrapper (ADR-0003).
 *
 * Strategy:
 *  - Load the GIS script (`https://accounts.google.com/gsi/client`) on demand.
 *  - Initialize a token client with `prompt: ''` for silent re-auth on focus / 401.
 *  - Tokens live ~1h. Caller invokes `getAccessToken` and we cache the latest
 *    fresh token in memory. Refresh is request-on-demand.
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
}

const DEFAULT_SCOPE =
  'https://www.googleapis.com/auth/drive openid email profile';

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

export type AuthEventListener = (event: AuthEvent) => void;

/**
 * Drive auth context. One instance per app. `getAccessToken` returns a usable
 * token, transparently refreshing when expired.
 */
export class DriveAuth {
  private readonly config: AuthConfig;
  private readonly scope: string;
  private cached: CachedToken | null = null;
  private tokenClient: GisTokenClient | null = null;
  private pendingResolve: ((token: string) => void) | null = null;
  private pendingReject: ((err: Error) => void) | null = null;
  private readonly listeners = new Set<AuthEventListener>();

  constructor(config: AuthConfig) {
    this.config = config;
    this.scope = config.scope ?? DEFAULT_SCOPE;
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
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${GIS_SCRIPT_URL}"]`,
      );
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
      client_id: this.config.clientId,
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
    this.emit({ type: 'token-acquired', expiresAt });
    this.pendingResolve?.(resp.access_token);
    this.pendingResolve = null;
    this.pendingReject = null;
  }

  private async requestNewToken({ silent }: { silent: boolean }): Promise<string> {
    const client = await this.ensureTokenClient();
    return new Promise<string>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;
      const opts: { prompt?: string; hint?: string } = {};
      if (silent) opts.prompt = '';
      if (this.config.loginHint) opts.hint = this.config.loginHint;
      client.requestAccessToken(opts);
    });
  }
}
