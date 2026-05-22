import { describe, expect, it } from 'vitest';
import {
  AmbiguousBlockRefError,
  BlockRefNotFoundError,
  findLineByBlockRef,
  insertLine,
  removeLine,
  replaceLine,
} from './lines';

const sampleBody = [
  '- [ ] Trail runners (qty:: 1) (cost:: 120 USD) #gear/shoes ^s-e5f6',
  '- [x] Sunscreen (qty:: 2) ✅ 2026-05-10 #toiletries ^s-g7h8',
  '- [ ] Towel ^s-k9l0',
  '- [ ] Adapter #gear/electronics ^s-m1n2',
  '',
].join('\n');

describe('findLineByBlockRef', () => {
  it('returns null when the ref is absent', () => {
    expect(findLineByBlockRef(sampleBody, '^missing')).toBeNull();
  });

  it('finds a ref mid-file', () => {
    const hit = findLineByBlockRef(sampleBody, '^s-g7h8');
    expect(hit?.lineIndex).toBe(1);
    expect(hit?.line).toMatch(/Sunscreen/);
  });

  it('finds a ref at the last line (no trailing newline)', () => {
    const body = 'first line ^a-1\nsecond line ^a-2';
    expect(findLineByBlockRef(body, '^a-2')).toEqual({
      lineIndex: 1,
      line: 'second line ^a-2',
    });
  });

  it('accepts the ref with or without a leading caret', () => {
    expect(findLineByBlockRef(sampleBody, 's-k9l0')).not.toBeNull();
    expect(findLineByBlockRef(sampleBody, '^s-k9l0')).not.toBeNull();
  });

  it('tolerates trailing whitespace after the ref', () => {
    const body = 'item one ^x-1   \nitem two ^x-2';
    expect(findLineByBlockRef(body, '^x-1')?.lineIndex).toBe(0);
  });

  it('does not match refs that are not the final token', () => {
    const body = '- ^x-1 not at end\n- ends correctly ^x-2';
    expect(findLineByBlockRef(body, '^x-1')).toBeNull();
    expect(findLineByBlockRef(body, '^x-2')?.lineIndex).toBe(1);
  });

  it('throws when multiple lines share the ref', () => {
    const body = 'one ^dup\ntwo ^dup\n';
    expect(() => findLineByBlockRef(body, '^dup')).toThrow(AmbiguousBlockRefError);
  });
});

describe('replaceLine', () => {
  it('replaces a line in place, leaving siblings untouched', () => {
    const out = replaceLine(
      sampleBody,
      '^s-g7h8',
      '- [x] Sunscreen (qty:: 3) ✅ 2026-05-10 #toiletries ^s-g7h8',
    );
    const lines = out.split('\n');
    expect(lines[1]).toBe('- [x] Sunscreen (qty:: 3) ✅ 2026-05-10 #toiletries ^s-g7h8');
    expect(lines[0]).toBe(sampleBody.split('\n')[0]);
    expect(lines[2]).toBe(sampleBody.split('\n')[2]);
  });

  it('preserves the trailing newline of the input', () => {
    const out = replaceLine(sampleBody, '^s-k9l0', '- [x] Towel ^s-k9l0');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('throws when ref is missing', () => {
    expect(() => replaceLine(sampleBody, '^missing', 'x ^missing')).toThrow(BlockRefNotFoundError);
  });

  it('throws when the new line contains a newline', () => {
    expect(() => replaceLine(sampleBody, '^s-k9l0', 'a\nb ^s-k9l0')).toThrow(/newline/);
  });

  it('throws on ambiguous refs', () => {
    const body = 'a ^dup\nb ^dup\n';
    expect(() => replaceLine(body, '^dup', 'c ^dup')).toThrow(AmbiguousBlockRefError);
  });
});

describe('insertLine', () => {
  it('appends to the end when no anchor is given', () => {
    const out = insertLine(sampleBody, '- [ ] New item ^s-new1');
    expect(out.endsWith('- [ ] New item ^s-new1\n')).toBe(true);
    expect(out.split('\n').length).toBe(sampleBody.split('\n').length + 1);
  });

  it('inserts after the anchor line', () => {
    const out = insertLine(sampleBody, '- [ ] After sunscreen ^s-new2', {
      afterBlockRef: '^s-g7h8',
    });
    const lines = out.split('\n');
    expect(lines[1]).toMatch(/Sunscreen/);
    expect(lines[2]).toBe('- [ ] After sunscreen ^s-new2');
    expect(lines[3]).toMatch(/Towel/);
  });

  it('inserts into an empty body', () => {
    const out = insertLine('', '- new ^s-x');
    expect(out).toBe('- new ^s-x');
  });

  it('throws when anchor is missing', () => {
    expect(() => insertLine(sampleBody, '- new ^x', { afterBlockRef: '^missing' })).toThrow(
      BlockRefNotFoundError,
    );
  });

  it('throws when new line contains a newline', () => {
    expect(() => insertLine(sampleBody, 'a\nb ^q')).toThrow(/newline/);
  });

  it('throws on ambiguous anchor', () => {
    const body = 'a ^dup\nb ^dup\n';
    expect(() => insertLine(body, 'c ^c', { afterBlockRef: '^dup' })).toThrow(
      AmbiguousBlockRefError,
    );
  });
});

describe('removeLine', () => {
  it('removes the matching line, leaves the rest intact', () => {
    const out = removeLine(sampleBody, '^s-g7h8');
    const lines = out.split('\n');
    expect(lines).not.toContain(expect.stringMatching(/Sunscreen/));
    expect(lines[0]).toMatch(/Trail runners/);
    expect(lines[1]).toMatch(/Towel/);
  });

  it('removes the only line and returns empty', () => {
    const out = removeLine('- only ^x-1\n', '^x-1');
    expect(out).toBe('');
  });

  it('removes the only line without trailing newline and returns empty', () => {
    const out = removeLine('- only ^x-1', '^x-1');
    expect(out).toBe('');
  });

  it('throws when ref is missing', () => {
    expect(() => removeLine(sampleBody, '^missing')).toThrow(BlockRefNotFoundError);
  });

  it('throws on ambiguous refs', () => {
    const body = 'a ^dup\nb ^dup\n';
    expect(() => removeLine(body, '^dup')).toThrow(AmbiguousBlockRefError);
  });
});

describe('block-ref detection edge cases', () => {
  it('matches refs at end of file with no trailing newline', () => {
    const body = 'last line ^z-9';
    expect(findLineByBlockRef(body, '^z-9')?.lineIndex).toBe(0);
  });

  it('rejects empty refs', () => {
    expect(findLineByBlockRef('text ^abc', '')).toBeNull();
    expect(findLineByBlockRef('text ^abc', '^')).toBeNull();
  });

  it('ignores ^ characters in the middle of a line', () => {
    const body = 'x ^mid more text ^ok-1';
    expect(findLineByBlockRef(body, '^mid')).toBeNull();
    expect(findLineByBlockRef(body, '^ok-1')?.lineIndex).toBe(0);
  });
});
