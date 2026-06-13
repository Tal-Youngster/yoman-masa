/**
 * Real Gmail REST client (ADR-0016). Read-only.
 *
 * Compiles in Node but needs a browser at runtime through the shared
 * `getAccessToken` getter (the same GIS token the Drive client uses, now
 * minted with the gmail.readonly scope added in `main.tsx`). No network tests
 * here — the pure decoding lives in `mime.ts` and is tested there; the fake in
 * `fake.ts` covers wiring.
 */

import {
  extractBodyText,
  parseMessageMeta,
  type GmailRawMessage,
} from './mime';
import {
  GmailApiError,
  GmailAuthError,
  type GmailClient,
  type GmailMessageMeta,
} from './types';

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const DEFAULT_MAX = 25;

/** Headers requested for the inbox list; keeps each `get` small. */
const META_HEADERS = ['From', 'Subject'] as const;

export interface RealGmailClientOptions {
  /** Shared access-token getter — same source the Drive client uses. */
  getAccessToken: () => Promise<string>;
  /** Inject `fetch` for testability. Defaults to the global. */
  fetchImpl?: typeof fetch;
}

export class RealGmailClient implements GmailClient {
  private readonly getAccessToken: () => Promise<string>;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: RealGmailClientOptions) {
    this.getAccessToken = opts.getAccessToken;
    const fallback: typeof fetch = () => {
      throw new Error('fetch is not available in this environment');
    };
    this.fetchImpl =
      opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : fallback);
  }

  async listRecentInbox(max = DEFAULT_MAX): Promise<readonly GmailMessageMeta[]> {
    const list = await this.api<{ messages?: { id: string }[] }>(
      `${API}/messages?labelIds=INBOX&maxResults=${encodeURIComponent(String(max))}`,
    );
    const ids = (list.messages ?? []).map((m) => m.id);
    // One metadata `get` per row. Lazy on body — that's fetched on tap.
    const metaQuery =
      `format=metadata&` + META_HEADERS.map((h) => `metadataHeaders=${h}`).join('&');
    const metas = await Promise.all(
      ids.map((id) => this.api<GmailRawMessage>(`${API}/messages/${encodeURIComponent(id)}?${metaQuery}`)),
    );
    return metas.map(parseMessageMeta);
  }

  async getMessageText(id: string): Promise<string> {
    const msg = await this.api<GmailRawMessage>(
      `${API}/messages/${encodeURIComponent(id)}?format=full`,
    );
    return extractBodyText(msg.payload);
  }

  private async api<T>(url: string): Promise<T> {
    const token = await this.getAccessToken();
    const resp = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 401 || resp.status === 403) {
      throw new GmailAuthError();
    }
    if (!resp.ok) {
      throw new GmailApiError(`GET ${url}`, resp.status, await safeText(resp));
    }
    return (await resp.json()) as T;
  }
}

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return '';
  }
}
