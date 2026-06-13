import { afterEach, describe, expect, it, vi } from 'vitest';
import { staticMapUrl } from './static-map';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('staticMapUrl', () => {
  it('returns null when no API key is configured', () => {
    vi.stubEnv('VITE_GOOGLE_API_KEY', '');
    expect(staticMapUrl({ width: 100, height: 100 })).toBeNull();
  });

  it('builds a size + scale + key URL', () => {
    vi.stubEnv('VITE_GOOGLE_API_KEY', 'test-key');
    const url = staticMapUrl({ width: 320, height: 160, scale: 2 });
    expect(url).not.toBeNull();
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe('https://maps.googleapis.com/maps/api/staticmap');
    expect(u.searchParams.get('size')).toBe('320x160');
    expect(u.searchParams.get('scale')).toBe('2');
    expect(u.searchParams.get('key')).toBe('test-key');
  });

  it('omits center/zoom when only markers are given (API auto-fits)', () => {
    vi.stubEnv('VITE_GOOGLE_API_KEY', 'k');
    const url = staticMapUrl({
      width: 200,
      height: 200,
      markers: [{ lat: 1, lng: 2 }],
    });
    const u = new URL(url as string);
    expect(u.searchParams.has('center')).toBe(false);
    expect(u.searchParams.has('zoom')).toBe(false);
  });

  it('groups markers by colour and converts hex to 0x form', () => {
    vi.stubEnv('VITE_GOOGLE_API_KEY', 'k');
    const url = staticMapUrl({
      width: 200,
      height: 200,
      markers: [
        { lat: 1, lng: 1, color: '#1f8a4c' },
        { lat: 2, lng: 2, color: '#1f8a4c' },
        { lat: 3, lng: 3, color: '#e0413e' },
      ],
    });
    const u = new URL(url as string);
    const markers = u.searchParams.getAll('markers');
    expect(markers).toHaveLength(2);
    expect(markers).toContain('color:0x1f8a4c|1,1|2,2');
    expect(markers).toContain('color:0xe0413e|3,3');
  });
});
