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

  getMessageText(id: string): Promise<string> {
    const found = this.messages.find((m) => m.id === id);
    return Promise.resolve(found?.body ?? '');
  }
}
