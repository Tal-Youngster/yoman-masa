import { describe, expect, it } from 'vitest';
import { parseGoogleMapsUrl } from './google-maps-link';

describe('parseGoogleMapsUrl', () => {
  it('extracts name + viewport coords from a desktop /maps/place URL', () => {
    const url =
      'https://www.google.com/maps/place/Eiffel+Tower/@48.8584,2.2945,17z/data=!3m1!4b1!4m6!1s0x47e66e2964e34e2d:0x8ddca9ee380ef7e0';
    expect(parseGoogleMapsUrl(url)).toEqual({
      name: 'Eiffel Tower',
      lat: 48.8584,
      lng: 2.2945,
      shortened: false,
    });
  });

  it('does NOT treat the hex feature id in /data= as a place_id', () => {
    const url = 'https://www.google.com/maps/place/X/@1,2,17z/data=!4m1!1s0x47e6:0x8ddc';
    expect(parseGoogleMapsUrl(url)?.placeId).toBeUndefined();
  });

  it('uses query_place_id from an api=1 share link', () => {
    const url =
      'https://www.google.com/maps/search/?api=1&query=48.8584%2C2.2945&query_place_id=ChIJLU7jZClu5kcR4PcOlaVle0Y';
    const r = parseGoogleMapsUrl(url);
    expect(r?.placeId).toBe('ChIJLU7jZClu5kcR4PcOlaVle0Y');
    expect(r?.lat).toBe(48.8584);
    expect(r?.lng).toBe(2.2945);
  });

  it('prefers explicit query coords over the @ viewport center', () => {
    const url = 'https://www.google.com/maps/place/Foo/@10,20,15z?q=48.85,2.29';
    const r = parseGoogleMapsUrl(url);
    expect(r?.lat).toBe(48.85);
    expect(r?.lng).toBe(2.29);
  });

  it('parses ?q=lat,lng on maps.google.com', () => {
    expect(parseGoogleMapsUrl('https://maps.google.com/?q=51.5074,-0.1278')).toEqual({
      lat: 51.5074,
      lng: -0.1278,
      shortened: false,
    });
  });

  it('parses a coords-only /maps/@ URL', () => {
    expect(parseGoogleMapsUrl('https://www.google.com/maps/@-33.8688,151.2093,14z')).toEqual({
      lat: -33.8688,
      lng: 151.2093,
      shortened: false,
    });
  });

  it('treats a /place/<lat,lng> segment as coordinates, not a name', () => {
    const r = parseGoogleMapsUrl('https://www.google.com/maps/place/40.4168,-3.7038');
    expect(r?.lat).toBe(40.4168);
    expect(r?.lng).toBe(-3.7038);
    expect(r?.name).toBeUndefined();
  });

  it('flags shortened links it cannot expand', () => {
    expect(parseGoogleMapsUrl('https://maps.app.goo.gl/aBcD1234')).toEqual({ shortened: true });
    expect(parseGoogleMapsUrl('https://goo.gl/maps/aBcD1234')).toEqual({ shortened: true });
  });

  it('accepts a bare "lat, lng" pasted string', () => {
    expect(parseGoogleMapsUrl('  48.8584, 2.2945 ')).toEqual({
      lat: 48.8584,
      lng: 2.2945,
      shortened: false,
    });
  });

  it('rejects out-of-range coordinates', () => {
    expect(parseGoogleMapsUrl('200,400')).toBeNull();
  });

  it('returns null for non-Google or junk input', () => {
    expect(parseGoogleMapsUrl('https://example.com/maps/place/Foo')).toBeNull();
    expect(parseGoogleMapsUrl('hello world')).toBeNull();
    expect(parseGoogleMapsUrl('')).toBeNull();
  });
});
