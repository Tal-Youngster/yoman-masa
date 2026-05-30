/**
 * Minimal KV store interface mocked behind a thin contract so feature slices and
 * S2 (Dexie-backed storage) can swap in the real implementation without changing
 * the shell. Keys mirror the planned set documented in IMPLEMENTATION-PLAN.md.
 */

export type KVKey =
  | 'active_trip_id'
  | 'vault_root_file_id'
  | 'travel_folder_file_id'
  /** Captured at pick time so the SyncStatus popover can render a folder name
   *  without round-tripping `drive.getMetadata`. Offline-safe. */
  | 'travel_folder_name'
  | 'drive_changes_page_token';

export type KVValue<K extends KVKey> = K extends 'active_trip_id'
  ? string | null
  : K extends 'vault_root_file_id' | 'travel_folder_file_id' | 'travel_folder_name'
    ? string | null
    : K extends 'drive_changes_page_token'
      ? string | null
      : never;

export interface KVStore {
  get<K extends KVKey>(key: K): Promise<KVValue<K> | null>;
  set<K extends KVKey>(key: K, value: KVValue<K>): Promise<void>;
}

/** In-memory implementation used until S2 (Dexie) lands. */
export function createMemoryKVStore(initial: Partial<Record<KVKey, unknown>> = {}): KVStore {
  const map = new Map<string, unknown>(Object.entries(initial));
  return {
    get<K extends KVKey>(key: K): Promise<KVValue<K> | null> {
      return Promise.resolve((map.get(key) as KVValue<K> | undefined) ?? null);
    },
    set<K extends KVKey>(key: K, value: KVValue<K>): Promise<void> {
      map.set(key, value);
      return Promise.resolve();
    },
  };
}
