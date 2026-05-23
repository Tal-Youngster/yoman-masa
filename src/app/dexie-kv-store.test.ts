import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeTestDb, deleteDatabase } from '@/lib/storage/test-helpers';
import type { TravelDB } from '@/lib/storage';

import { createDexieKVStore } from './dexie-kv-store';

describe('createDexieKVStore', () => {
  let db: TravelDB;

  beforeEach(() => {
    db = makeTestDb('kv-adapter');
  });

  afterEach(async () => {
    db.close();
    await deleteDatabase(db.name);
  });

  it('returns null for an unset key', async () => {
    const store = createDexieKVStore(db);
    expect(await store.get('active_trip_id')).toBeNull();
  });

  it('round-trips a value through Dexie', async () => {
    const store = createDexieKVStore(db);
    await store.set('travel_folder_file_id', 'fld_abc');
    expect(await store.get('travel_folder_file_id')).toBe('fld_abc');
  });

  it('deletes the row when set is called with null', async () => {
    const store = createDexieKVStore(db);
    await store.set('drive_changes_page_token', 'tok-1');
    await store.set('drive_changes_page_token', null);
    expect(await store.get('drive_changes_page_token')).toBeNull();
  });
});
