/**
 * Inbound (Drive → Dexie) reconciler for the tasks ledger.
 *
 * Two valid locations per ADR-0010:
 *   - `Trips/<slug>/Tasks.md`   — trip-scoped list
 *   - `General/Tasks.md`        — cross-trip "General" list (trip_id: null)
 *
 * Multi-entity per file (each `- [ ] …` line is a task). The pull worker
 * handles per-row delete bookkeeping via `file_meta.last_entity_ids`
 * (ADR-0014 addendum 2026-06-06) — we only have to parse and return the
 * current task set.
 */

import type { Task } from '@/domain/task';
import { deleteTask as deleteTaskRow, upsertTask } from '@/lib/storage';
import type { InboundReconciler } from '@/sync/pull';

import { parseTasksFile } from './parser';

/** Per-trip: `Trips/<slug>/Tasks.md`. */
const TRIP_TASKS_PATH_RE = /^Trips\/[a-z0-9][a-z0-9-]*\/Tasks\.md$/;
/** Cross-trip "General" list. */
const GENERAL_TASKS_PATH_RE = /^General\/Tasks\.md$/;

export const taskInboundReconciler: InboundReconciler<Task> = {
  entityType: 'task',

  matchesPath(relPath) {
    return TRIP_TASKS_PATH_RE.test(relPath) || GENERAL_TASKS_PATH_RE.test(relPath);
  },

  parseFile(content) {
    try {
      return parseTasksFile(content).tasks;
    } catch {
      // Unparseable frontmatter (missing `type: tasks`, broken yaml). Treat
      // as "skip this file" rather than raising the error counter — a stray
      // file with the right path but wrong content shouldn't poison the pass.
      return [];
    }
  },

  entityId(task) {
    return task.id;
  },

  async upsertEntity(task, db) {
    await upsertTask(task, db);
  },

  async deleteEntity(id, db) {
    await deleteTaskRow(id as Task['id'], db);
  },

  async listEntityIds(db) {
    const keys = await db.tasks.toCollection().primaryKeys();
    return keys.filter((k) => typeof k === 'string');
  },
};
