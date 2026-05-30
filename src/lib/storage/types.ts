import type {
  TripId,
  AccommodationId,
  PlaceId,
  ExpenseId,
  TaskId,
  ShoppingItemId,
  ArticleId,
} from '@/domain/ids';

/** Discriminant used by the write queue and file_meta tables.
 *
 * `active_config` is a synthetic type owned by S5: the per-user
 * `.travel/config.json` pointer file is serialized through the write queue
 * with this discriminator and a JSON reconciler.
 */
export type EntityType =
  | 'trip'
  | 'accommodation'
  | 'place'
  | 'expense'
  | 'task'
  | 'shopping_item'
  | 'article'
  | 'active_config'
  | 'rates_snapshot';

export type EntityId =
  | TripId
  | AccommodationId
  | PlaceId
  | ExpenseId
  | TaskId
  | ShoppingItemId
  | ArticleId;

export type WriteOp = 'create' | 'update' | 'delete';

/**
 * A single pending mutation in the write queue.
 * `payload` carries the serialized entity (for create/update) or null (for delete).
 * `base_revision` is the Drive headRevisionId observed at enqueue time, used by S3 to
 * detect mid-flight concurrent edits.
 *
 * `file_id` and `resolved_path` were added in v3 (S5) so the sync worker can route
 * a queued row to Drive without consulting entity-specific helpers. The
 * WRITE_ALLOWED_PREFIX guard re-checks `resolved_path` immediately before any
 * write — burying it in `payload` would couple the guard to per-entity layout.
 */
export interface WriteQueueItem {
  /** ULID — client-generated; replays are idempotent (ADR-0006). */
  id: string;
  entity_type: EntityType;
  entity_id: string;
  op: WriteOp;
  payload: unknown;
  base_revision: string | null;
  /** Drive file id the edit targets; `null` for first-time creates. */
  file_id: string | null;
  /** Resolved vault path of the target file (re-checked by WRITE_ALLOWED_PREFIX). */
  resolved_path: string;
  attempts: number;
  last_error: string | null;
  /** epoch ms */
  created_at: number;
}

/** Drive metadata cached per file. Keyed by Drive `file_id`. */
export interface FileMeta {
  file_id: string;
  entity_type: EntityType;
  entity_id: string;
  head_revision_id: string;
  /** RFC 3339 from Drive (kept as-is to compare with future fetches). */
  modified_time: string;
  path: string;
}

/**
 * App-level config keys. The KVValue<K> map enforces typing per key.
 * Add new keys here and to `KVValueMap` to keep getKV/setKV typed.
 */
export type KVKey =
  | 'active_trip_id'
  | 'vault_root_file_id'
  | 'travel_folder_file_id'
  /** Display name of the picked Travel folder. Captured from the Picker at
   *  pick time so the UI can show "Folder: <name>" even when offline. */
  | 'travel_folder_name'
  | 'drive_changes_page_token'
  | 'rates_snapshot';

/**
 * Inline shape — `src/lib/currency/` is the typed owner and validates with a
 * zod schema on read. Stored as a JSON blob in Dexie's kv table.
 */
export interface StoredRatesSnapshot {
  base: string;
  date: string;
  rates: Record<string, number>;
  source: 'frankfurter' | 'fallback';
}

export interface KVValueMap {
  active_trip_id: TripId;
  vault_root_file_id: string;
  travel_folder_file_id: string;
  travel_folder_name: string;
  drive_changes_page_token: string;
  rates_snapshot: StoredRatesSnapshot;
}
export type KVValue<K extends KVKey> = KVValueMap[K];

export interface KVRow<K extends KVKey = KVKey> {
  key: K;
  value: KVValueMap[K];
}
