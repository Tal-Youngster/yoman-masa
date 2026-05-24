/**
 * Serializer for task lines and Tasks.md files.
 *
 * Token order is canonical and matches `parser.ts`'s expectations:
 *   - [{status}] {title} {priority?} {dates in fixed order} {#tags} {unknown} ^t-<ulid>
 *
 * A task with the same fields always serializes to the same bytes, so a
 * canonically-ordered line round-trips byte-for-byte. Unknown tokens are
 * re-emitted verbatim (after the tags, before the block ref).
 */

import { serializeFrontmatter, type LineEnding } from '@/lib/markdown';
import type { Task } from '@/domain/task';
import {
  CHAR_BY_STATUS,
  EMOJI_BY_PRIORITY,
  DATE_EMOJIS_IN_ORDER,
  TASKS_FRONTMATTER_TYPE,
} from './parser';
import { taskBlockRef } from './paths';

export function serializeTaskLine(task: Task, indent = ''): string {
  const parts: string[] = [`${indent}- [${CHAR_BY_STATUS[task.status]}]`, task.title];

  if (task.priority) parts.push(EMOJI_BY_PRIORITY[task.priority]);

  for (const [field, emoji] of DATE_EMOJIS_IN_ORDER) {
    const value = task[field];
    if (value) parts.push(emoji, value);
  }

  for (const tag of task.tags) parts.push(`#${tag}`);
  for (const token of task.unknown_tokens) parts.push(token);

  parts.push(`^${taskBlockRef(task.id)}`);
  return parts.join(' ');
}

export interface SerializeTasksFileInput {
  /** `null` for the cross-trip General list. */
  tripId: string | null;
  tasks: readonly Task[];
  trailingBody?: string;
  lineEnding?: LineEnding;
}

export function serializeTasksFile(input: SerializeTasksFileInput): string {
  const frontmatter: Record<string, unknown> = { type: TASKS_FRONTMATTER_TYPE };
  if (input.tripId !== null) frontmatter['trip_id'] = input.tripId;

  const taskLines = input.tasks.map((t) => serializeTaskLine(t));
  const trailing = input.trailingBody?.trimEnd() ?? '';
  const body =
    trailing === ''
      ? `\n${taskLines.join('\n')}\n`
      : `\n${taskLines.join('\n')}\n\n${trailing}\n`;
  return serializeFrontmatter(frontmatter, body, { lineEnding: input.lineEnding ?? 'lf' });
}
