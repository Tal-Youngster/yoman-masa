import { describe, it, expect } from 'vitest';
import { createMemoryKVStore } from './kv-store';

describe('createMemoryKVStore', () => {
  it('returns null for unknown keys', async () => {
    const kv = createMemoryKVStore();
    expect(await kv.get('active_trip_id')).toBeNull();
    expect(await kv.get('travel_folder_file_id')).toBeNull();
  });

  it('round-trips values through set/get', async () => {
    const kv = createMemoryKVStore();
    await kv.set('active_trip_id', 'trip-1');
    expect(await kv.get('active_trip_id')).toBe('trip-1');
  });

  it('seeds from initial values', async () => {
    const kv = createMemoryKVStore({ active_trip_id: 'trip-seed' });
    expect(await kv.get('active_trip_id')).toBe('trip-seed');
  });

  it('overwrites prior values', async () => {
    const kv = createMemoryKVStore({ active_trip_id: 'a' });
    await kv.set('active_trip_id', 'b');
    expect(await kv.get('active_trip_id')).toBe('b');
  });

  it('stores null explicitly', async () => {
    const kv = createMemoryKVStore({ active_trip_id: 'a' });
    await kv.set('active_trip_id', null);
    expect(await kv.get('active_trip_id')).toBeNull();
  });
});
