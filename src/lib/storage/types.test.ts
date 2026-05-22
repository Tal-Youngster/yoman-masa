import { describe, expect, it } from 'vitest';
import { typeChecks } from './types.test-d';

/**
 * Runtime shim: just importing `types.test-d` is enough to ensure tsc runs over it.
 * The actual assertions live in `@ts-expect-error` directives and are enforced at typecheck.
 */
describe('compile-time type checks (see types.test-d.ts)', () => {
  it('module loads', () => {
    expect(typeof typeChecks).toBe('object');
  });
});
