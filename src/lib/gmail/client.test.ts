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
