import { describe, expect, it } from 'vitest';
import { FakeGmail, type FakeGmailMessage } from './fake';

const msg = (over: Partial<FakeGmailMessage>): FakeGmailMessage => ({
  id: 'x',
  from: 'noreply@booking.com',
  subject: 'Your booking is confirmed',
  date: '2026-06-01T00:00:00.000Z',
  snippet: 'Check-in 12 June',
  body: 'Hotel Splendid, Lisbon',
  ...over,
});

describe('FakeGmail', () => {
  const gmail = new FakeGmail([
    msg({ id: 'a', date: '2026-06-01T00:00:00.000Z' }),
    msg({ id: 'b', date: '2026-07-01T00:00:00.000Z', subject: 'Newsletter', body: 'unrelated', snippet: '' }),
  ]);

  it('lists newest first without leaking bodies', async () => {
    const inbox = await gmail.listRecentInbox();
    expect(inbox.map((m) => m.id)).toEqual(['b', 'a']);
    expect(inbox[0]).not.toHaveProperty('body');
  });

  it('matches sender, subject and body, newest first', async () => {
    expect((await gmail.searchMessages('lisbon')).map((m) => m.id)).toEqual(['a']);
    expect((await gmail.searchMessages('BOOKING.COM')).map((m) => m.id)).toEqual(['b', 'a']);
    expect(await gmail.searchMessages('nothing here')).toEqual([]);
  });

  it('falls back to the recent list for a blank query', async () => {
    expect((await gmail.searchMessages('  ')).map((m) => m.id)).toEqual(['b', 'a']);
  });
});
