/**
 * Natural-language quick-add parser (Todoist-style).
 *
 * Lifts a due date, priority, and `#tags` out of a free-typed string so
 *   `Book flights tomorrow p1 #travel/flights`
 * becomes `{ title: 'Book flights', due_date: <tomorrow>, priority: 'high',
 *           tags: ['travel/flights'] }`.
 *
 * Every field it produces is one the vault line already supports (ADR-0004),
 * so quick-add needs no schema change. Pure and framework-free: it must run in
 * Node (tests) and the browser, so it imports only from `@/domain`.
 *
 * Ambiguity is resolved in favour of predictability over cleverness:
 *  - The *first* recognized date token wins; later date-like words stay in the title.
 *  - A bare weekday means the next occurrence *including today* (so "mon" on a
 *    Monday is today), matching Todoist.
 *  - Unrecognized words are title text. A weekday or date word that is genuinely
 *    part of a title ("call Friday's bakery") will be misread — the same trade-off
 *    Todoist makes; the full form remains available for exact control.
 */

import { IsoDate, todayIso, addDays } from '@/domain/dates';
import type { TaskPriority } from '@/domain/task';

export interface QuickAddParse {
  title: string;
  tags: string[];
  priority?: TaskPriority;
  due_date?: IsoDate;
}

/** Todoist `p1`–`p4`, mapped onto our five-level scale (`lowest` isn't reachable here). */
const PRIORITY_BY_TOKEN: Record<string, TaskPriority> = {
  p1: 'highest',
  p2: 'high',
  p3: 'medium',
  p4: 'low',
};

/** Weekday index (0 = Sunday) keyed by full name and three-letter abbrev. */
const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const ISO_TOKEN_RE = /^\d{4}-\d{2}-\d{2}$/;

function weekdayOf(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Next date (including today) whose weekday matches `targetDow`. */
function nextWeekday(today: IsoDate, targetDow: number): IsoDate {
  const offset = (targetDow - weekdayOf(today) + 7) % 7;
  return addDays(today, offset);
}

/**
 * Resolve a single lowercased word to a due date, or `null` if it isn't a date.
 * Multi-word phrases ("in 3 days", "next week") are handled before tokenizing.
 */
function dateFromWord(word: string, today: IsoDate): IsoDate | null {
  switch (word) {
    case 'today':
    case 'tod':
      return today;
    case 'tomorrow':
    case 'tmr':
    case 'tom':
      return addDays(today, 1);
  }
  if (Object.hasOwn(WEEKDAY_INDEX, word)) {
    return nextWeekday(today, WEEKDAY_INDEX[word]);
  }
  if (ISO_TOKEN_RE.test(word)) {
    const parsed = IsoDate.safeParse(word);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/**
 * Parse a quick-add string. `today` is injectable for deterministic tests;
 * production passes the real UTC today.
 */
export function parseQuickAdd(input: string, today: IsoDate = todayIso()): QuickAddParse {
  // Phrase patterns first — they span multiple words, so a token scan can't see them.
  let rest = input;
  let due: IsoDate | undefined;

  const inDays = /\bin (\d{1,3}) days?\b/i.exec(rest);
  if (inDays) {
    due = addDays(today, Number(inDays[1]));
    rest = rest.slice(0, inDays.index) + rest.slice(inDays.index + inDays[0].length);
  } else if (/\bnext week\b/i.test(rest)) {
    due = addDays(today, 7);
    rest = rest.replace(/\bnext week\b/i, ' ');
  }

  const tags: string[] = [];
  const titleParts: string[] = [];
  let priority: TaskPriority | undefined;

  for (const token of rest.split(/\s+/)) {
    if (token === '') continue;
    const lower = token.toLowerCase();

    if (Object.hasOwn(PRIORITY_BY_TOKEN, lower)) {
      priority ??= PRIORITY_BY_TOKEN[lower];
      continue;
    }
    if (token.startsWith('#') && token.length > 1) {
      tags.push(token.slice(1));
      continue;
    }
    if (due === undefined) {
      const date = dateFromWord(lower, today);
      if (date) {
        due = date;
        continue;
      }
    }
    titleParts.push(token);
  }

  return {
    title: titleParts.join(' ').trim(),
    tags,
    ...(priority ? { priority } : {}),
    ...(due ? { due_date: due } : {}),
  };
}
