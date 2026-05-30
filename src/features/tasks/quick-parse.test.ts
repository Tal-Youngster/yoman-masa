import { describe, it, expect } from 'vitest';
import { isoDate } from '@/domain/dates';
import { parseQuickAdd } from './quick-parse';

// 2026-05-25 is a Monday — pinned so weekday math is deterministic.
const TODAY = isoDate('2026-05-25');

describe('parseQuickAdd', () => {
  it('returns a plain string as the title', () => {
    expect(parseQuickAdd('Book Vietnam flights', TODAY)).toEqual({
      title: 'Book Vietnam flights',
      tags: [],
    });
  });

  it('maps p1–p4 onto the priority scale', () => {
    expect(parseQuickAdd('x p1', TODAY).priority).toBe('highest');
    expect(parseQuickAdd('x p2', TODAY).priority).toBe('high');
    expect(parseQuickAdd('x p3', TODAY).priority).toBe('medium');
    expect(parseQuickAdd('x p4', TODAY).priority).toBe('low');
  });

  it('collects #tags, including nested ones', () => {
    expect(parseQuickAdd('renew passport #travel/admin #urgent', TODAY).tags).toEqual([
      'travel/admin',
      'urgent',
    ]);
  });

  it('resolves today and tomorrow', () => {
    expect(parseQuickAdd('pay visa today', TODAY).due_date).toBe(isoDate('2026-05-25'));
    expect(parseQuickAdd('pay visa tomorrow', TODAY).due_date).toBe(isoDate('2026-05-26'));
    expect(parseQuickAdd('pay visa tmr', TODAY).due_date).toBe(isoDate('2026-05-26'));
  });

  it('treats a weekday as the next occurrence including today', () => {
    // today is Monday → "mon" is today, "fri" is this Friday, "sun" wraps to the 31st
    expect(parseQuickAdd('standup mon', TODAY).due_date).toBe(isoDate('2026-05-25'));
    expect(parseQuickAdd('standup friday', TODAY).due_date).toBe(isoDate('2026-05-29'));
    expect(parseQuickAdd('standup sun', TODAY).due_date).toBe(isoDate('2026-05-31'));
  });

  it('handles "in N days" and "next week" phrases', () => {
    expect(parseQuickAdd('deposit in 3 days', TODAY).due_date).toBe(isoDate('2026-05-28'));
    expect(parseQuickAdd('plan next week', TODAY)).toEqual({
      title: 'plan',
      tags: [],
      due_date: isoDate('2026-06-01'),
    });
  });

  it('accepts an explicit ISO date', () => {
    expect(parseQuickAdd('book hostel 2026-06-15', TODAY).due_date).toBe(isoDate('2026-06-15'));
  });

  it('parses a full combination into all fields', () => {
    expect(parseQuickAdd('Book flights tomorrow p1 #travel/flights', TODAY)).toEqual({
      title: 'Book flights',
      tags: ['travel/flights'],
      priority: 'highest',
      due_date: isoDate('2026-05-26'),
    });
  });

  it('is case-insensitive for keywords and priority', () => {
    const r = parseQuickAdd('Pay P2 TOMORROW', TODAY);
    expect(r.priority).toBe('high');
    expect(r.due_date).toBe(isoDate('2026-05-26'));
    expect(r.title).toBe('Pay');
  });

  it('lets the first date win and keeps later date words as title text', () => {
    expect(parseQuickAdd('call mon tomorrow', TODAY)).toEqual({
      title: 'call tomorrow',
      tags: [],
      due_date: isoDate('2026-05-25'),
    });
  });

  it('yields an empty title when only metadata is typed', () => {
    expect(parseQuickAdd('tomorrow p1 #x', TODAY).title).toBe('');
  });

  it('ignores an invalid ISO date and keeps it in the title', () => {
    const r = parseQuickAdd('review 2026-13-40', TODAY);
    expect(r.due_date).toBeUndefined();
    expect(r.title).toBe('review 2026-13-40');
  });
});
