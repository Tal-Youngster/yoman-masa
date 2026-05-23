import { describe, it, expect } from 'vitest';
import { currency } from '@/domain/money';
import { IsoDate } from '@/domain/dates';
import { ratesReconciler, type RatesPayload } from './reconciler';
import { RatesSnapshot } from './types';
import type { WriteQueueItem } from '@/sync/queue';

const snap: RatesSnapshot = RatesSnapshot.parse({
  base: currency('USD'),
  date: IsoDate.parse('2026-05-22'),
  rates: { EUR: 0.92 },
  source: 'frankfurter',
});

const item = (payload: RatesPayload): WriteQueueItem<RatesPayload> => ({
  id: '01',
  entityType: 'rates_snapshot',
  entityId: '2026-05-22',
  op: 'create',
  payload,
  baseRevision: null,
  fileId: null,
  resolvedPath: 'Travel/.travel/rates/2026-05-22.json',
  attempts: 0,
  lastError: null,
  createdAt: '2026-05-22T00:00:00Z',
});

describe('ratesReconciler', () => {
  it('round-trips through to/from markdown', () => {
    const serialized = ratesReconciler.toMarkdown(snap, null);
    const parsed = ratesReconciler.fromMarkdown(serialized);
    expect(parsed).toEqual(snap);
  });

  it('applyEdit overwrites with the payload snapshot', () => {
    const original = ratesReconciler.toMarkdown(snap, null);
    const next = RatesSnapshot.parse({ ...snap, rates: { EUR: 0.93 } });
    const out = ratesReconciler.applyEdit(original, item({ snapshot: next }));
    const parsed = ratesReconciler.fromMarkdown(out);
    expect(parsed?.rates.EUR).toBe(0.93);
  });

  it('fromMarkdown returns null on malformed JSON', () => {
    expect(ratesReconciler.fromMarkdown('not json')).toBeNull();
    expect(ratesReconciler.fromMarkdown('{"junk":true}')).toBeNull();
  });
});
