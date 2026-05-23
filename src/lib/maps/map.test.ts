import { describe, expect, it, vi } from 'vitest';
import maplibregl from 'maplibre-gl';
import { initPMTiles } from './pmtiles-loader';

vi.mock('maplibre-gl', () => {
  return {
    default: {
      addProtocol: vi.fn(),
    },
  };
});

describe('pmtiles-loader', () => {
  it('initializes PMTiles protocol in maplibre-gl', () => {
    initPMTiles();
    expect(maplibregl.addProtocol).toHaveBeenCalledWith('pmtiles', expect.any(Function));
  });
});
