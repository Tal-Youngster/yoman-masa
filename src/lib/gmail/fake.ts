/**
 * In-memory Gmail client for tests and offline/dev shells. Holds a fixed set of
 * messages; `listRecentInbox` returns them newest-first, `getMessageText`
 * returns the canned body. Mirrors the role of `FakeDrive`.
 */

import type { GmailClient, GmailMessageMeta } from './types';

export interface FakeGmailMessage extends GmailMessageMeta {
  body: string;
}

export class FakeGmail implements GmailClient {
  private readonly messages: FakeGmailMessage[];

  constructor(messages: FakeGmailMessage[] = []) {
    this.messages = messages;
  }

  listRecentInbox(max = 25): Promise<readonly GmailMessageMeta[]> {
    const sorted = [...this.messages].sort((a, b) => b.date.localeCompare(a.date));
    return Promise.resolve(
      sorted.slice(0, max).map(({ body: _body, ...meta }) => meta),
    );
  }

  /**
   * Naive substring match over sender / subject / snippet / body. The real
   * client hands the query to Gmail; the fake only needs to be good enough to
   * exercise the picker's search wiring.
   */
  searchMessages(query: string, max = 25): Promise<readonly GmailMessageMeta[]> {
    const q = query.trim().toLowerCase();
    if (!q) return this.listRecentInbox(max);
    const haystack = (m: FakeGmailMessage): string =>
      `${m.from} ${m.subject} ${m.snippet} ${m.body}`.toLowerCase();
    const hits = [...this.messages]
      .filter((m) => haystack(m).includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
    return Promise.resolve(hits.slice(0, max).map(({ body: _body, ...meta }) => meta));
  }

  getMessageText(id: string): Promise<string> {
    const found = this.messages.find((m) => m.id === id);
    return Promise.resolve(found?.body ?? '');
  }
}
