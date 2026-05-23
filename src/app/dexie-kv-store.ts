import { deleteKV, getKV, setKV } from '@/lib/storage';
import type { TravelDB } from '@/lib/storage';
import type { KVValue as DexieKVValue } from '@/lib/storage/types';

import type { KVStore, KVKey, KVValue as ShellKVValue } from './kv-store';

export function createDexieKVStore(db?: TravelDB): KVStore {
  return {
    async get<K extends KVKey>(key: K): Promise<ShellKVValue<K> | null> {
      const value = await getKV(key, db);
      return value as ShellKVValue<K> | null;
    },
    async set<K extends KVKey>(key: K, value: ShellKVValue<K>): Promise<void> {
      if (value === null) {
        await deleteKV(key, db);
        return;
      }
      await setKV(key, value as unknown as DexieKVValue<K>, db);
    },
  };
}
