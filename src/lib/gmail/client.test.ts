import { describe, expect, it, vi } from 'vitest';
import { RealGmailClient } from './client';
import { GmailApiError, GmailAuthError } from './types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const b64url = (s: string): string => Buffer.from(s, 'utf-8').toString('base64url');
const urlOf = (input: RequestInfo | URL): string => (typeof input === 'string' ? input : '');

describe('RealGmailClient', () => {
  it('lists the inbox and maps metadata', async () => {
    const fetchImpl = vi.fn((input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      const u = urlOf(input);
      if (u.includes('/messages?'))
        return Promise.resolve(jsonResponse({ messages: [{ id: 'a' }, { id: 'b' }] }));
      const id = u.includes('/messages/a') ? 'a' : 'b';
      return Promise.resolve(
        jsonResponse({
          id,
          snippet: `snippet ${id}`,
          internalDate: '1700000000000',
          payload: {
            headers: [
              { name: 'From', value: `${id}@x.com` },
              { name: 'Subject', value: id },
            ],
          },
        }),
      );
    });
    const client = new RealGmailClient({ getAccessToken: () => Promise.resolve('tok'), fetchImpl });

    const inbox = await client.listRecentInbox(2);
    expect(inbox.map((m) => m.id)).toEqual(['a', 'b']);
    expect(inbox[0]).toMatchObject({ from: 'a@x.com', subject: 'a', snippet: 'snippet a' });
    // Token sent as a bearer header.
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ headers: { Authorization: 'Bearer tok' } });
  });

  it('searches all mail with the raw query and no INBOX filter', async () => {
    const seen: string[] = [];
    const fetchImpl = (input: RequestInfo | URL): Promise<Response> => {
      const u = urlOf(input);
      seen.push(u);
      if (u.includes('/messages?')) return Promise.resolve(jsonResponse({ messages: [{ id: 'a' }] }));
      return Promise.resolve(
        jsonResponse({
          id: 'a',
          internalDate: '1700000000000',
          payload: { headers: [{ name: 'Subject', value: 'Your booking' }] },
        }),
      );
    };
    const client = new RealGmailClient({ getAccessToken: () => Promise.resolve('tok'), fetchImpl });

    const hits = await client.searchMessages('from:booking.com hotel', 5);
    expect(hits.map((m) => m.subject)).toEqual(['Your booking']);
    const listUrl = seen[0] ?? '';
    expect(listUrl).toContain('q=from%3Abooking.com%20hotel');
    expect(listUrl).toContain('maxResults=5');
    // Archived confirmations must be findable, so the search is not INBOX-scoped.
    expect(listUrl).not.toContain('labelIds');
  });

  it('falls back to the recent inbox for a blank query', async () => {
    const seen: string[] = [];
    const fetchImpl = (input: RequestInfo | URL): Promise<Response> => {
      seen.push(urlOf(input));
      return Promise.resolve(jsonResponse({ messages: [] }));
    };
    const client = new RealGmailClient({ getAccessToken: () => Promise.resolve('tok'), fetchImpl });

    await client.searchMessages('   ');
    expect(seen[0]).toContain('labelIds=INBOX');
    expect(seen[0]).not.toContain('q=');
  });

  it('decodes the body of a fetched message', async () => {
    const fetchImpl = (): Promise<Response> =>
      Promise.resolve(
        jsonResponse({
          id: 'a',
          payload: { mimeType: 'text/plain', body: { data: b64url('Booking confirmed') } },
        }),
      );
    const client = new RealGmailClient({ getAccessToken: () => Promise.resolve('tok'), fetchImpl });
    expect(await client.getMessageText('a')).toBe('Booking confirmed');
  });

  it('throws GmailAuthError on 401/403 (stale or missing scope)', async () => {
    for (const status of [401, 403]) {
      const client = new RealGmailClient({
        getAccessToken: () => Promise.resolve('tok'),
        fetchImpl: () => Promise.resolve(jsonResponse({ error: 'no' }, status)),
      });
      await expect(client.listRecentInbox()).rejects.toBeInstanceOf(GmailAuthError);
    }
  });

  it('throws GmailApiError on other failures', async () => {
    const client = new RealGmailClient({
      getAccessToken: () => Promise.resolve('tok'),
      fetchImpl: () => Promise.resolve(jsonResponse({ error: 'boom' }, 500)),
    });
    await expect(client.listRecentInbox()).rejects.toBeInstanceOf(GmailApiError);
  });
});
