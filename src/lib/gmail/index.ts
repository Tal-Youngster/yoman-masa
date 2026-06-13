export type { GmailClient, GmailMessageMeta } from './types';
export { GmailAuthError, GmailApiError } from './types';
export { RealGmailClient, type RealGmailClientOptions } from './client';
export { FakeGmail, type FakeGmailMessage } from './fake';
export { decodeBase64Url, extractBodyText, stripHtml, parseMessageMeta } from './mime';
