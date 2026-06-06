// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PathLayer } from './PathLayer';

// `useMap()` is mocked to return a fake map object so PathLayer's effect runs.
// `google.maps.Polyline` is replaced with a constructor that records every call.
vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => fakeMap,
}));

const fakeMap = { __id: 'map' } as unknown as google.maps.Map;

interface PolylineOptions {
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
}

interface PolylineCall {
  initialPath: google.maps.LatLngLiteral[];
  setPaths: google.maps.LatLngLiteral[][];
  setOptions: PolylineOptions[];
  setMaps: Array<google.maps.Map | null>;
}
const polylines: PolylineCall[] = [];

class FakePolyline {
  private record: PolylineCall;
  constructor(opts: { path?: google.maps.LatLngLiteral[]; map?: google.maps.Map | null }) {
    this.record = {
      initialPath: opts.path ?? [],
      setPaths: [],
      setOptions: [],
      setMaps: [],
    };
    polylines.push(this.record);
  }
  setPath(p: google.maps.LatLngLiteral[]): void {
    this.record.setPaths.push(p);
  }
  setOptions(o: PolylineOptions): void {
    this.record.setOptions.push(o);
  }
  setMap(m: google.maps.Map | null): void {
    this.record.setMaps.push(m);
  }
}

interface GoogleGlobal { maps: { Polyline: typeof FakePolyline } }

beforeEach(() => {
  polylines.length = 0;
  (globalThis as unknown as { google: GoogleGlobal }).google = {
    maps: { Polyline: FakePolyline },
  };
});

describe('PathLayer', () => {
  it('renders to null (overlay, no DOM)', () => {
    const { container } = render(<PathLayer path={[{ lat: 0, lng: 0 }]} />);
    expect(container.innerHTML).toBe('');
  });

  it('constructs exactly one Polyline on mount', () => {
    render(<PathLayer path={[{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]} />);
    expect(polylines).toHaveLength(1);
    expect(polylines[0]?.initialPath).toEqual([{ lat: 1, lng: 1 }, { lat: 2, lng: 2 }]);
  });

  it('mutates the existing polyline via setPath on prop change (does not recreate)', () => {
    const { rerender } = render(<PathLayer path={[{ lat: 1, lng: 1 }]} />);
    expect(polylines).toHaveLength(1);

    rerender(<PathLayer path={[{ lat: 1, lng: 1 }, { lat: 3, lng: 3 }]} />);
    expect(polylines).toHaveLength(1); // still just one!
    // initial setPath fires once on mount (effect order), plus once for the rerender.
    const calls = polylines[0]?.setPaths ?? [];
    expect(calls[calls.length - 1]).toEqual([{ lat: 1, lng: 1 }, { lat: 3, lng: 3 }]);
  });

  it('pushes style updates via setOptions, not via reconstruction', () => {
    const { rerender } = render(<PathLayer path={[]} strokeColor="#000000" />);
    rerender(<PathLayer path={[]} strokeColor="#ffffff" strokeWeight={5} />);
    expect(polylines).toHaveLength(1);
    const lastOpts = polylines[0]?.setOptions.at(-1);
    expect(lastOpts?.strokeColor).toBe('#ffffff');
    expect(lastOpts?.strokeWeight).toBe(5);
  });

  it('calls setMap(null) on unmount', () => {
    const { unmount } = render(<PathLayer path={[{ lat: 0, lng: 0 }]} />);
    unmount();
    const maps = polylines[0]?.setMaps ?? [];
    expect(maps[maps.length - 1]).toBeNull();
  });
});
