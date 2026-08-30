/**
 * Gmail read-only client surface (ADR-0016).
 *
 * Parallel to `src/sync/drive`, but smaller: the app only ever *reads* the
 * inbox to feed a confirmation email into the AI extractor. There is no write
 * or send surface here by design — the scope is `gmail.readonly` and the
 * interface mirrors that.
 */

/** Lightweight inbox-row metadata. No body — bodies are fetched lazily on tap. */
export interface GmailMessageMeta {
  id: string;
  /** Raw `From` header (e.g. `Booking.com <noreply@booking.com>`). */
  from: string;
  subject: string;
  /** ISO timestamp derived from the message `internalDate`. */
  date: string;
  /** Gmail's own short preview snippet. */
  snippet: string;
}

export interface GmailClient {
  /** Newest INBOX messages, metadata only. */
  listRecentInbox(max?: number): Promise<readonly GmailMessageMeta[]>;
  /**
   * Metadata for messages matching a Gmail search query. Spans the whole
   * mailbox, not just INBOX — confirmations are often archived or labelled by
   * the time the trip is being planned. `query` is passed to Gmail verbatim,
   * so operators (`from:`, `subject:`, `after:`) work.
   */
  searchMessages(query: string, max?: number): Promise<readonly GmailMessageMeta[]>;
  /** Decoded body text of one message (text/plain, falling back to stripped HTML). */
  getMessageText(id: string): Promise<string>;
}

/**
 * Thrown on 401/403. The shared access token may predate the gmail.readonly
 * scope grant, or Google revoked it — either way the fix is an interactive
 * reconnect. The UI routes this to the existing "Reconnect Drive" flow.
 */
export class GmailAuthError extends Error {
  constructor(message = 'Gmail access requires reconnecting your Google account') {
    super(message);
    this.name = 'GmailAuthError';
  }
}

export class GmailApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail = '',
  ) {
    super(message);
    this.name = 'GmailApiError';
  }
}
