import 'fake-indexeddb/auto';
import { TravelDB } from './db';

/** Build a fresh, uniquely named in-memory DB for one test. */
export function makeTestDb(label?: string): TravelDB {
  const name = `travel-test-${label ?? 'db'}-${Math.random().toString(36).slice(2)}`;
  return new TravelDB(name);
}

/**
 * `indexedDB.deleteDatabase` returns an `IDBOpenDBRequest`, not a Promise — wrap it so
 * tests can `await` the deletion before moving on.
 */
export function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`deleteDatabase(${name}) failed`));
    req.onblocked = () => resolve();
  });
}
