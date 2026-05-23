/**
 * `.travel/config.json` reconciler.
 *
 * The active-trip pointer lives in a JSON file under the Travel folder so
 * Obsidian, the app, and any other future client share a single source of
 * truth. The reconciler treats the file content as JSON: parse → patch the
 * `active_trip_id` key → re-serialize with stable 2-space indent + trailing
 * newline.
 *
 * Singleton: `entityType: 'active_config'`, `entityId: '_singleton_'`.
 *
 * Unknown JSON keys are preserved (forward-compat: a later slice might add
 * `recent_currencies` or similar). The patch is surgical — we only rewrite
 * the `active_trip_id` field.
 */

import { z } from 'zod';

import type { Reconciler, WriteQueueItem } from '@/sync/queue';

const ACTIVE_CONFIG_ENTITY = 'active_config';
const ACTIVE_CONFIG_SINGLETON_ID = '_singleton_';

const ActiveConfigPayload = z.object({
  active_trip_id: z.string().nullable(),
});
export type ActiveConfigPayload = z.infer<typeof ActiveConfigPayload>;

/** In-memory shape — opaque to the reconciler aside from `active_trip_id`. */
export interface ActiveConfig extends Record<string, unknown> {
  active_trip_id: string | null;
}

function parseConfig(content: string): ActiveConfig {
  if (content.trim() === '') return { active_trip_id: null };
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      // Coerce `active_trip_id` to either a string or null. Anything else
      // gets normalized to null so a malformed remote doesn't blow up the
      // patch.
      const id = obj['active_trip_id'];
      const safe: ActiveConfig = {
        ...obj,
        active_trip_id: typeof id === 'string' ? id : null,
      };
      return safe;
    }
  } catch {
    /* fall through */
  }
  return { active_trip_id: null };
}

function serializeConfig(cfg: ActiveConfig): string {
  // Stable 2-space indent + trailing newline — Obsidian + most editors
  // expect that and it makes diffs friendly.
  return `${JSON.stringify(cfg, null, 2)}\n`;
}

export const activeConfigReconciler: Reconciler<ActiveConfig, ActiveConfigPayload> = {
  entityType: ACTIVE_CONFIG_ENTITY,

  fromMarkdown(content: string): ActiveConfig | null {
    if (content.trim() === '') return null;
    try {
      const parsed = JSON.parse(content) as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      const obj = parsed as Record<string, unknown>;
      const id = obj['active_trip_id'];
      return { ...obj, active_trip_id: typeof id === 'string' ? id : null };
    } catch {
      return null;
    }
  },

  toMarkdown(entity: ActiveConfig, _originalContent: string | null): string {
    return serializeConfig(entity);
  },

  applyEdit(originalContent: string, item: WriteQueueItem<unknown>): string {
    const payload = ActiveConfigPayload.parse(item.payload);
    const original = parseConfig(originalContent);
    const next: ActiveConfig = {
      ...original,
      active_trip_id: payload.active_trip_id,
    };
    return serializeConfig(next);
  },
};

export const ACTIVE_CONFIG = {
  entityType: ACTIVE_CONFIG_ENTITY,
  singletonId: ACTIVE_CONFIG_SINGLETON_ID,
} as const;
