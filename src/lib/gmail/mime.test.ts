import { describe, expect, it } from 'vitest';
import {
  decodeBase64Url,
  extractBodyText,
  parseMessageMeta,
  stripHtml,
  type GmailPayloadPart,
} from './mime';

/** Encode a UTF-8 string the way Gmail does: base64url, no padding. */
function b64url(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64url');
}

describe('decodeBase64Url', () => {
  it('round-trips ASCII', () => {
    expect(decodeBase64Url(b64url('Hello, world'))).toBe('Hello, world');
  });

  it('decodes multi-byte UTF-8 (accents, currency)', () => {
    const s = 'Réservation confirmée — 120 € à Montréal';
    expect(decodeBase64Url(b64url(s))).toBe(s);
  });

  it('handles missing padding and url-safe chars', () => {
    // '???' encodes to bytes that exercise the + and / -> - and _ mapping.
    const s = 'subjects??>>';
    expect(decodeBase64Url(b64url(s))).toBe(s);
  });
});

describe('stripHtml', () => {
  it('drops tags, scripts, styles and collapses whitespace', () => {
    const html =
      '<html><head><style>.x{color:red}</style></head><body><script>evil()</script>' +
      '<p>Check-in:&nbsp;15:00</p>\n\n<div>  Room 4 </div></body></html>';
    expect(stripHtml(html)).toBe('Check-in: 15:00 Room 4');
  });
});

describe('extractBodyText', () => {
  it('prefers text/plain over text/html', () => {
    const payload: GmailPayloadPart = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: b64url('Plain body') } },
        { mimeType: 'text/html', body: { data: b64url('<p>HTML body</p>') } },
      ],
    };
    expect(extractBodyText(payload)).toBe('Plain body');
  });

  it('falls back to stripped HTML when no plain part exists', () => {
    const payload: GmailPayloadPart = {
      mimeType: 'multipart/alternative',
      parts: [{ mimeType: 'text/html', body: { data: b64url('<b>Booking</b> confirmed') } }],
    };
    expect(extractBodyText(payload)).toBe('Booking confirmed');
  });

  it('reads a single non-multipart text/plain payload', () => {
    const payload: GmailPayloadPart = {
      mimeType: 'text/plain',
      body: { data: b64url('Direct body') },
    };
    expect(extractBodyText(payload)).toBe('Direct body');
  });

  it('recurses into nested multipart trees', () => {
    const payload: GmailPayloadPart = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [{ mimeType: 'text/plain', body: { data: b64url('Nested plain') } }],
        },
      ],
    };
    expect(extractBodyText(payload)).toBe('Nested plain');
  });

  it('ignores attachment parts even if they are text', () => {
    const payload: GmailPayloadPart = {
      mimeType: 'multipart/mixed',
      parts: [
        { mimeType: 'text/plain', body: { data: b64url('Real body') } },
        {
          mimeType: 'text/plain',
          filename: 'voucher.txt',
          body: { data: b64url('attachment text') },
        },
      ],
    };
    expect(extractBodyText(payload)).toBe('Real body');
  });

  it('returns empty string for a missing payload', () => {
    expect(extractBodyText(undefined)).toBe('');
  });
});

describe('parseMessageMeta', () => {
  it('extracts headers case-insensitively and converts internalDate', () => {
    const meta = parseMessageMeta({
      id: 'm1',
      snippet: 'Your stay is confirmed',
      internalDate: '1700000000000',
      payload: {
        headers: [
          { name: 'from', value: 'Booking.com <noreply@booking.com>' },
          { name: 'Subject', value: 'Confirmation 12345' },
        ],
      },
    });
    expect(meta).toEqual({
      id: 'm1',
      from: 'Booking.com <noreply@booking.com>',
      subject: 'Confirmation 12345',
      date: new Date(1_700_000_000_000).toISOString(),
      snippet: 'Your stay is confirmed',
    });
  });

  it('tolerates a missing internalDate and headers', () => {
    const meta = parseMessageMeta({ id: 'm2' });
    expect(meta).toEqual({ id: 'm2', from: '', subject: '', date: '', snippet: '' });
  });
});
