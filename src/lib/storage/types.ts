import type { TripId, AccommodationId, PlaceId, ExpenseId, TaskId, ShoppingItemId, ArticleId } from '@/domain/ids';

/** Discriminant used by the write queue and file_meta tables. */
export type EntityType =
  | 'trip'
  | 'accommodation'
  | 'place'
  | 'expense'
  | 'task'
  | 'shopping_item'
  | 'article';

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
 */
export interface WriteQueueItem {
  /** ULID — client-generated; replays are idempotent (ADR-0006). */
  id: string;
  entity_type: EntityType;
  entity_id: string;
  op: WriteOp;
  payload: unknown;
  base_revision: string | null;
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
  | 'drive_changes_page_token';

export interface KVValueMap {
  active_trip_id: TripId;
  vault_root_file_id: string;
  travel_folder_file_id: string;
  drive_changes_page_token: string;
}
export type KVValue<K extends KVKey> = KVValueMap[K];

export interface KVRow<K extends KVKey = KVKey> {
  key: K;
  value: KVValueMap[K];
}
