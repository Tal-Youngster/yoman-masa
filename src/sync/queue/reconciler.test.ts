import { describe, expect, it } from 'vitest';

import { ReconcilerRegistry, type Reconciler } from './reconciler.js';

const stub: Reconciler<unknown, unknown> = {
  entityType: 'stub',
  fromMarkdown: () => null,
  toMarkdown: () => '',
  applyEdit: (orig) => orig,
};

describe('ReconcilerRegistry', () => {
  it('registers and retrieves by entity type', () => {
    const r = new ReconcilerRegistry();
    r.register(stub);
    expect(r.has('stub')).toBe(true);
    expect(r.get('stub')).toBe(stub);
  });

  it('throws on duplicate register', () => {
    const r = new ReconcilerRegistry();
    r.register(stub);
    expect(() => r.register(stub)).toThrow(/already registered/);
  });

  it('override replaces an existing reconciler', () => {
    const r = new ReconcilerRegistry();
    r.register(stub);
    const replacement: Reconciler<unknown, unknown> = { ...stub, fromMarkdown: () => null };
    r.override(replacement);
    expect(r.get('stub')).toBe(replacement);
  });

  it('returns null for unknown entity type', () => {
    const r = new ReconcilerRegistry();
    expect(r.get('nope')).toBeNull();
  });

  it('unregister removes an entry', () => {
    const r = new ReconcilerRegistry();
    r.register(stub);
    r.unregister('stub');
    expect(r.has('stub')).toBe(false);
  });
});
