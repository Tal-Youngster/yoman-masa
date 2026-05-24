import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { TripId } from '@/domain/ids';
import { parseTaskLine, parseTasksFile, isTaskLine, TaskLineParseError } from './parser';
import { serializeTaskLine } from './serializer';
import { Task } from '@/domain/task';

const TRIP = TripId.parse('trp_01HABCDEFGHJKMNPQRSTVWXYZ0');

/**
 * Corpus of canonically-ordered Tasks-plugin lines (ADR-0004). Each must
 * round-trip byte-for-byte through parse → serialize. Covers: all four
 * statuses, every priority, every date emoji, multiple tags, inline links in
 * the title, and unknown trailing tokens (the 🔁 recurrence rule we don't
 * model).
 */
const CORPUS: string[] = [
  '- [ ] Book Vietnam flights ^t-01HABCDEFGHJKMNPQRSTVWXYZ0',
  '- [x] Renew passport ✅ 2026-04-02 ^t-01HABCDEFGHJKMNPQRSTVWXYZ1',
  '- [/] Research visa requirements ^t-01HABCDEFGHJKMNPQRSTVWXYZ2',
  '- [-] Cancel old booking ^t-01HABCDEFGHJKMNPQRSTVWXYZ3',
  '- [ ] Pack bags 🔼 📅 2026-06-15 ^t-01HABCDEFGHJKMNPQRSTVWXYZ4',
  '- [ ] Call bank ⏫ ➕ 2026-05-21 📅 2026-05-25 #travel/admin ^t-01HABCDEFGHJKMNPQRSTVWXYZ5',
  '- [ ] Buy adapters 🔺 🛫 2026-06-01 ⏳ 2026-06-02 📅 2026-06-10 #gear ^t-01HABCDEFGHJKMNPQRSTVWXYZ6',
  '- [ ] Lowest prio thing ⏬ ^t-01HABCDEFGHJKMNPQRSTVWXYZ7',
  '- [ ] Low prio thing 🔽 ^t-01HABCDEFGHJKMNPQRSTVWXYZ8',
  '- [ ] Tagged task #travel/flights #urgent ^t-01HABCDEFGHJKMNPQRSTVWXYZ9',
  '- [ ] Task with unknown 📅 2026-07-01 #t 🔁 every-week ^t-01HABCDEFGHJKMNPQRSTVWXYZA',
  '- [x] Completed with all dates ⏫ ➕ 2026-05-01 🛫 2026-05-02 ⏳ 2026-05-03 📅 2026-05-04 ✅ 2026-05-05 #done ^t-01HABCDEFGHJKMNPQRSTVWXYZB',
  '- [ ] Multi word title with several words ^t-01HABCDEFGHJKMNPQRSTVWXYZC',
  '- [ ] Task with a link [docs](https://example.com) 📅 2026-08-01 ^t-01HABCDEFGHJKMNPQRSTVWXYZD',
  '- [ ] Plain task with trailing tag only #misc ^t-01HABCDEFGHJKMNPQRSTVWXYZE',
  '- [ ] Scheduled only ⏳ 2026-09-09 ^t-01HABCDEFGHJKMNPQRSTVWXYZF',
];

describe('parseTaskLine', () => {
  it('parses the canonical ADR-0004 example', () => {
    const line =
      '- [ ] Call bank ⏫ ➕ 2026-05-21 📅 2026-05-25 #travel/admin ^t-01HABCDEFGHJKMNPQRSTVWXYZ5';
    const { task, blockRef } = parseTaskLine(line, TRIP);
    expect(task.title).toBe('Call bank');
    expect(task.status).toBe('open');
    expect(task.priority).toBe('high');
    expect(task.created_date).toBe('2026-05-21');
    expect(task.due_date).toBe('2026-05-25');
    expect(task.tags).toEqual(['travel/admin']);
    expect(task.trip_id).toBe(TRIP);
    expect(blockRef).toBe('t-01HABCDEFGHJKMNPQRSTVWXYZ5');
  });

  it('maps every status marker', () => {
    expect(parseTaskLine('- [ ] a ^t-01HABCDEFGHJKMNPQRSTVWXYZ0', null).task.status).toBe('open');
    expect(parseTaskLine('- [x] a ^t-01HABCDEFGHJKMNPQRSTVWXYZ0', null).task.status).toBe('done');
    expect(parseTaskLine('- [/] a ^t-01HABCDEFGHJKMNPQRSTVWXYZ0', null).task.status).toBe('in_progress');
    expect(parseTaskLine('- [-] a ^t-01HABCDEFGHJKMNPQRSTVWXYZ0', null).task.status).toBe('cancelled');
  });

  it('keeps unknown trailing tokens verbatim', () => {
    const { task } = parseTaskLine(CORPUS[10], null);
    expect(task.unknown_tokens).toEqual(['🔁', 'every-week']);
    expect(task.tags).toEqual(['t']);
    expect(task.due_date).toBe('2026-07-01');
  });

  it('keeps an inline link inside the title', () => {
    const { task } = parseTaskLine(CORPUS[13], null);
    expect(task.title).toBe('Task with a link [docs](https://example.com)');
    expect(task.due_date).toBe('2026-08-01');
  });

  it('captures the source indentation', () => {
    const { indent, task } = parseTaskLine('    - [ ] Nested ^t-01HABCDEFGHJKMNPQRSTVWXYZ0', null);
    expect(indent).toBe('    ');
    expect(task.title).toBe('Nested');
  });

  it('throws without a block ref', () => {
    expect(() => parseTaskLine('- [ ] no ref here', null)).toThrow(TaskLineParseError);
  });

  it('throws on an empty title', () => {
    expect(() => parseTaskLine('- [ ] 📅 2026-01-01 ^t-01HABCDEFGHJKMNPQRSTVWXYZ0', null)).toThrow(
      /empty task title/,
    );
  });
});

describe('isTaskLine', () => {
  it('detects task-shaped lines', () => {
    expect(isTaskLine(CORPUS[0])).toBe(true);
    expect(isTaskLine('- [ ] missing block ref')).toBe(false);
    expect(isTaskLine('# heading')).toBe(false);
    expect(isTaskLine('just text')).toBe(false);
  });
});

describe('corpus round-trip (byte-for-byte)', () => {
  for (const line of CORPUS) {
    it(`round-trips: ${line.slice(0, 48)}…`, () => {
      const { task, indent } = parseTaskLine(line, null);
      expect(serializeTaskLine(task, indent)).toBe(line);
    });
  }
});

describe('parseTasksFile', () => {
  const file = `---
type: tasks
trip_id: trp_01HABCDEFGHJKMNPQRSTVWXYZ0
---

# My trip tasks

- [ ] Book Vietnam flights ^t-01HABCDEFGHJKMNPQRSTVWXYZ0
- [x] Renew passport ✅ 2026-04-02 #travel/admin ^t-01HABCDEFGHJKMNPQRSTVWXYZ1

A free-form note I want preserved.
`;

  it('parses task lines and stamps trip_id from frontmatter', () => {
    const parsed = parseTasksFile(file);
    expect(parsed.tripId).toBe(TRIP);
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[0]?.title).toBe('Book Vietnam flights');
    expect(parsed.tasks[1]?.status).toBe('done');
    expect(parsed.tasks.every((t) => t.trip_id === TRIP)).toBe(true);
  });

  it('preserves non-task lines in trailingBody', () => {
    const parsed = parseTasksFile(file);
    expect(parsed.trailingBody).toContain('# My trip tasks');
    expect(parsed.trailingBody).toContain('A free-form note I want preserved.');
  });

  it('treats a missing trip_id as the General list', () => {
    const general = `---
type: tasks
---

- [ ] Buy travel insurance ^t-01HABCDEFGHJKMNPQRSTVWXYZ0
`;
    const parsed = parseTasksFile(general);
    expect(parsed.tripId).toBeNull();
    expect(parsed.tasks[0]?.trip_id).toBeNull();
  });
});

describe('serialize → parse property', () => {
  const ulidBody = fc
    .string({ minLength: 26, maxLength: 26 })
    .map((s) => s.replace(/[^0-9A-HJKMNP-TV-Z]/g, '0').toUpperCase())
    .map((s) => s.padEnd(26, '0').slice(0, 26));

  // Title words: letters/digits only, so no token is mistaken for metadata.
  const titleWord = fc
    .string({ minLength: 1, maxLength: 8 })
    .map((s) => s.replace(/[^A-Za-z0-9]/g, 'x'))
    .map((s) => (s.length === 0 ? 'x' : s));

  const dateArb = fc
    .integer({ min: 1, max: 28 })
    .map((d) => `2026-06-${String(d).padStart(2, '0')}`);

  it('parse(serialize(task)) preserves structured fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          body: ulidBody,
          status: fc.constantFrom('open', 'in_progress', 'done', 'cancelled'),
          priority: fc.option(fc.constantFrom('highest', 'high', 'medium', 'low', 'lowest'), {
            nil: undefined,
          }),
          titleWords: fc.array(titleWord, { minLength: 1, maxLength: 5 }),
          due: fc.option(dateArb, { nil: undefined }),
          scheduled: fc.option(dateArb, { nil: undefined }),
          start: fc.option(dateArb, { nil: undefined }),
          tags: fc.array(
            fc.string({ minLength: 1, maxLength: 8 }).map((s) => s.replace(/[^a-z0-9/]/g, 'a')),
            { maxLength: 3 },
          ),
        }),
        (spec) => {
          const task = Task.parse({
            type: 'task',
            id: `tsk_${spec.body}`,
            trip_id: null,
            title: spec.titleWords.join(' '),
            status: spec.status,
            ...(spec.priority ? { priority: spec.priority } : {}),
            ...(spec.due ? { due_date: spec.due } : {}),
            ...(spec.scheduled ? { scheduled_date: spec.scheduled } : {}),
            ...(spec.start ? { start_date: spec.start } : {}),
            tags: spec.tags.filter((t) => t.length > 0),
          });
          const line = serializeTaskLine(task);
          const reparsed = parseTaskLine(line, null).task;
          expect(reparsed).toEqual(task);
        },
      ),
      { numRuns: 300 },
    );
  });
});
