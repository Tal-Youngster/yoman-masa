/**
 * Pure Gmail MIME helpers — no network, no DOM. These run in both Node (tests)
 * and the browser, so they only use `atob` / `TextDecoder`, both of which are
 * global in modern Node and browsers.
 */

import type { GmailMessageMeta } from './types';

/** Shape of the bits of the Gmail `messages.get` payload we read. */
export interface GmailPayloadPart {
  mimeType?: string;
  filename?: string;
  headers?: { name?: string; value?: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPayloadPart[];
}

export interface GmailRawMessage {
  id?: string;
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayloadPart;
}

/**
 * Decode Gmail's base64url-encoded body data to a UTF-8 string. Gmail uses the
 * URL-safe alphabet (`-` / `_`) and omits padding; normalize both before
 * `atob`, then run the bytes through `TextDecoder` so multi-byte characters
 * (accents, currency symbols) survive.
 */
export function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Strip tags + collapse whitespace from an HTML body to plain-ish text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function header(part: GmailPayloadPart | undefined, name: string): string {
  const found = part?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value ?? '';
}

/**
 * Walk the MIME tree and return the best text representation. Prefers any
 * `text/plain` part; if none is present, the first `text/html` part is
 * stripped to text. Attachment parts (those with a filename) are ignored.
 */
export function extractBodyText(payload: GmailPayloadPart | undefined): string {
  if (!payload) return '';

  const plains: string[] = [];
  const htmls: string[] = [];

  const visit = (part: GmailPayloadPart): void => {
    const isAttachment = !!part.filename;
    const data = part.body?.data;
    if (data && !isAttachment) {
      if (part.mimeType === 'text/plain') plains.push(decodeBase64Url(data));
      else if (part.mimeType === 'text/html') htmls.push(decodeBase64Url(data));
    }
    for (const child of part.parts ?? []) visit(child);
  };
  visit(payload);

  if (plains.length > 0) return plains.join('\n').trim();
  if (htmls.length > 0) return stripHtml(htmls.join('\n'));
  return '';
}

/** Build inbox-row metadata from a `format=metadata` (or full) message. */
export function parseMessageMeta(msg: GmailRawMessage): GmailMessageMeta {
  const internal = Number(msg.internalDate);
  const date = Number.isFinite(internal) && internal > 0 ? new Date(internal).toISOString() : '';
  return {
    id: msg.id ?? '',
    from: header(msg.payload, 'From'),
    subject: header(msg.payload, 'Subject'),
    date,
    snippet: msg.snippet ?? '',
  };
}
