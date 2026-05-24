/**
 * Obsidian Tasks-plugin line parser (ADR-0004).
 *
 *   - [ ] Book Vietnam flights ⏫ 🛫 2026-06-01 📅 2026-06-15 #travel/flights ^t-a1b2
 *   - [x] Renew passport ✅ 2026-04-02 #travel/admin ^t-c3d4
 *
 * One task is one list-item line. The app patches a single line by its trailing
 * `^t-<ulid>` block reference; everything else in the file is left untouched.
 *
 * The line model the parser commits to (the *canonical* order the serializer
 * emits, and the order the corpus must use to round-trip byte-for-byte):
 *
 *   {indent}- [{status}] {title} {priority?} {➕created?} {🛫start?}
 *           {⏳scheduled?} {📅due?} {✅done?} {#tag}* {unknown}* ^t-<ulid>
 *
 * Title closes at the first *recognized metadata token* (a priority/date emoji
 * or a `#tag`). Tokens after that point which we don't recognize are kept in
 * `unknown_tokens` verbatim so recurrence rules, inline fields, etc. survive a
 * round-trip. A `#`, priority emoji, or date emoji inside the title body is
 * therefore not supported — it would prematurely close the title. That matches
 * how the Tasks plugin itself lifts metadata out of a description and is fine
 * for app-authored tasks; hand-authored oddities still round-trip because the
 * whole line falls through to `trailingBody` when it can't be parsed.
 */

import { parseFrontmatter, type LineEnding } from '@/lib/markdown';
import { Task, type TaskStatus, type TaskPriority } from '@/domain/task';
import { TaskId, TripId } from '@/domain/ids';
import { IsoDate } from '@/domain/dates';

export interface ParsedTaskLine {
  task: Task;
  /** `t-<ulid>` — the Obsidian block ref without the leading caret. */
  blockRef: string;
  /** Leading whitespace of the source line, preserved for surgical edits. */
  indent: string;
}

export interface ParsedTasksFile {
  /** `null` for the cross-trip General list. */
  tripId: TripId | null;
  tasks: Task[];
  /** Unrecognized lines preserved verbatim so re-serialization is non-destructive. */
  trailingBody: string;
  lineEnding: LineEnding;
}

export class TaskLineParseError extends Error {
  override readonly name = 'TaskLineParseError';
  constructor(
    message: string,
    public readonly line: string,
  ) {
    super(message);
  }
}

// ── Token tables (single source of truth, shared with the serializer) ──────────

const STATUS_BY_CHAR: Record<string, TaskStatus> = {
  ' ': 'open',
  x: 'done',
  X: 'done',
  '/': 'in_progress',
  '-': 'cancelled',
};
export const CHAR_BY_STATUS: Record<TaskStatus, string> = {
  open: ' ',
  done: 'x',
  in_progress: '/',
  cancelled: '-',
};

const PRIORITY_BY_EMOJI: Record<string, TaskPriority> = {
  '🔺': 'highest',
  '⏫': 'high',
  '🔼': 'medium',
  '🔽': 'low',
  '⏬': 'lowest',
};
export const EMOJI_BY_PRIORITY: Record<TaskPriority, string> = {
  highest: '🔺',
  high: '⏫',
  medium: '🔼',
  low: '🔽',
  lowest: '⏬',
};

/** Which Task date field a leading date emoji sets. */
type DateField = 'created_date' | 'start_date' | 'scheduled_date' | 'due_date' | 'done_date';
const DATE_FIELD_BY_EMOJI: Record<string, DateField> = {
  '➕': 'created_date',
  '🛫': 'start_date',
  '⏳': 'scheduled_date',
  '📅': 'due_date',
  '✅': 'done_date',
};
/** Canonical emit order for the date fields (matches the Tasks plugin). */
export const DATE_EMOJIS_IN_ORDER: ReadonlyArray<[DateField, string]> = [
  ['created_date', '➕'],
  ['start_date', '🛫'],
  ['scheduled_date', '⏳'],
  ['due_date', '📅'],
  ['done_date', '✅'],
];

const CHECKBOX_RE = /^(\s*)- \[(.)\]\s+(.*)$/;
const BLOCK_REF_RE = /\s*\^(t-[A-Za-z0-9_-]+)\s*$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isMetadataStart(token: string): boolean {
  // `Object.hasOwn`, not `in` — `'toString' in obj` is true via the prototype
  // chain, which would misclassify an ordinary title word as metadata.
  return (
    Object.hasOwn(PRIORITY_BY_EMOJI, token) ||
    Object.hasOwn(DATE_FIELD_BY_EMOJI, token) ||
    token.startsWith('#')
  );
}

/**
 * Parse a single task line. `tripId` is stamped onto the resulting entity
 * (the file, not the line, knows which trip it belongs to). Throws
 * `TaskLineParseError` if the line isn't a parseable task.
 */
export function parseTaskLine(line: string, tripId: TripId | null): ParsedTaskLine {
  const checkbox = CHECKBOX_RE.exec(line.replace(/\s+$/, ''));
  if (!checkbox) throw new TaskLineParseError('not a "- [ ] …" task line', line);
  const [, indent, statusChar, afterCheckbox] = checkbox as unknown as [string, string, string, string];

  const status = STATUS_BY_CHAR[statusChar];
  if (!status) throw new TaskLineParseError(`unknown status marker "[${statusChar}]"`, line);

  const blockMatch = BLOCK_REF_RE.exec(afterCheckbox);
  if (!blockMatch) throw new TaskLineParseError('missing trailing ^t-<id> block ref', line);
  const blockRef = blockMatch[1];
  const middle = afterCheckbox.slice(0, blockMatch.index).trim();

  const tokens = middle.length === 0 ? [] : middle.split(/\s+/);
  const titleParts: string[] = [];
  const tags: string[] = [];
  const unknownTokens: string[] = [];
  const dates: Partial<Record<DateField, string>> = {};
  let priority: TaskPriority | undefined;
  let inMetadata = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!inMetadata && !isMetadataStart(token)) {
      titleParts.push(token);
      continue;
    }
    inMetadata = true;

    if (Object.hasOwn(PRIORITY_BY_EMOJI, token)) {
      priority = PRIORITY_BY_EMOJI[token];
      continue;
    }
    const dateField = Object.hasOwn(DATE_FIELD_BY_EMOJI, token)
      ? DATE_FIELD_BY_EMOJI[token]
      : undefined;
    if (dateField) {
      const value = tokens[i + 1];
      if (value && ISO_DATE_RE.test(value)) {
        dates[dateField] = value;
        i++;
      } else {
        // Dangling emoji with no valid date — keep it verbatim rather than lose it.
        unknownTokens.push(token);
      }
      continue;
    }
    if (token.startsWith('#') && token.length > 1) {
      tags.push(token.slice(1));
      continue;
    }
    unknownTokens.push(token);
  }

  const title = titleParts.join(' ');
  if (title.length === 0) throw new TaskLineParseError('empty task title', line);

  const task = Task.parse({
    type: 'task',
    id: TaskId.parse(`tsk_${blockRef.replace(/^t-/, '')}`),
    trip_id: tripId,
    title,
    status,
    ...(priority ? { priority } : {}),
    ...(dates.due_date ? { due_date: IsoDate.parse(dates.due_date) } : {}),
    ...(dates.scheduled_date ? { scheduled_date: IsoDate.parse(dates.scheduled_date) } : {}),
    ...(dates.start_date ? { start_date: IsoDate.parse(dates.start_date) } : {}),
    ...(dates.created_date ? { created_date: IsoDate.parse(dates.created_date) } : {}),
    ...(dates.done_date ? { done_date: IsoDate.parse(dates.done_date) } : {}),
    tags,
    unknown_tokens: unknownTokens,
  });

  return { task, blockRef, indent };
}

/** True if a line looks like a task we own (checkbox + trailing `^t-` ref). */
export function isTaskLine(line: string): boolean {
  const trimmed = line.replace(/\s+$/, '');
  return CHECKBOX_RE.test(trimmed) && BLOCK_REF_RE.test(trimmed);
}

const TASKS_FRONTMATTER_TYPE = 'tasks';

export interface ParseTasksOptions {
  /** Strict mode throws on task-shaped lines that fail to parse. Default: false
   *  — those lines fall through to `trailingBody`, preserving user content. */
  strict?: boolean;
}

/**
 * Parse a Tasks.md file. The `trip_id` comes from frontmatter (`null` for the
 * General list). Lines that don't parse as tasks are preserved verbatim in
 * `trailingBody` so headings, notes, and hand-authored content survive a write.
 */
export function parseTasksFile(content: string, opts: ParseTasksOptions = {}): ParsedTasksFile {
  const { frontmatter, body, lineEnding } = parseFrontmatter(content);
  const rawTripId = frontmatter['trip_id'];
  const tripId = rawTripId == null ? null : TripId.parse(rawTripId);

  const tasks: Task[] = [];
  const preserved: string[] = [];
  for (const line of body.split('\n')) {
    if (isTaskLine(line)) {
      try {
        tasks.push(parseTaskLine(line, tripId).task);
        continue;
      } catch (err) {
        if (opts.strict) throw err;
      }
    }
    preserved.push(line);
  }

  return { tripId, tasks, trailingBody: preserved.join('\n'), lineEnding };
}

export { TASKS_FRONTMATTER_TYPE };
