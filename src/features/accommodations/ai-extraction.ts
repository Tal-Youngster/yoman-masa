/**
 * Shared AI-extraction prompt + types for the accommodation autofill flow.
 * Both the URL/screenshot dialog and the Gmail picker feed this prompt to the
 * `AiClient` and post-process the result the same way.
 */

import type { AccommodationService } from '@/domain/accommodation';

export const AI_PROMPT = `Extract the accommodation booking details.
Return a JSON object matching this TypeScript interface exactly:
{
  "name": "string (the listing title or name of the hotel/property, e.g. 'Superhosted Castro Studio')",
  "checkin": "string (YYYY-MM-DD format)",
  "checkout": "string (YYYY-MM-DD format)",
  "checkin_time": "string (e.g. '15:00', '14:30', otherwise empty)",
  "checkout_time": "string (e.g. '11:00', '10:00', otherwise empty)",
  "price": "number (the total cost, numbers only, otherwise empty)",
  "currency": "string (3-letter currency code like USD, EUR, otherwise empty)",
  "address": "string (full address if available, otherwise empty)",
  "url": "string (if provided in text, otherwise empty)",
  "confirmation": "string (booking ID/confirmation code if found, otherwise empty)",
  "service": "string (one of: airbnb, booking, hostelworld, agoda, direct, other)"
}
Only output the JSON string, no markdown code block formatting.`;

export const ACCOMMODATION_SERVICES: AccommodationService[] = [
  'airbnb',
  'booking',
  'hostelworld',
  'agoda',
  'direct',
  'other',
];

export interface AiExtractedData {
  name?: string;
  checkin?: string;
  checkout?: string;
  checkin_time?: string;
  checkout_time?: string;
  price?: number;
  currency?: string;
  address?: string;
  url?: string;
  confirmation?: string;
  service?: AccommodationService;
}

/** Drop a `service` value the model invented that isn't in our enum. */
export function sanitizeExtracted(data: AiExtractedData): AiExtractedData {
  if (data.service && !ACCOMMODATION_SERVICES.includes(data.service)) {
    const { service: _service, ...rest } = data;
    return rest;
  }
  return data;
}
