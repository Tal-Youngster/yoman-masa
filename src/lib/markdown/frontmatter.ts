import { parse as yamlParse, stringify as yamlStringify } from 'yaml';

export type LineEnding = 'lf' | 'crlf';

export interface ParsedMarkdown {
  /** Parsed YAML frontmatter. Empty object if missing or empty. */
  frontmatter: Record<string, unknown>;
  /**
   * The document body — everything after the closing `---` fence (LF-normalized).
   * If no frontmatter was present, this is the full content (LF-normalized).
   */
  body: string;
  /** Whether the source contained a `---\n...\n---` frontmatter block. */
  hasFrontmatter: boolean;
  /** Original line ending detected in the source. */
  lineEnding: LineEnding;
}

export interface SerializeOptions {
  lineEnding?: LineEnding;
  /**
   * Force-emit the frontmatter fence even when `frontmatter` is empty.
   * Defaults to false: an empty object with no original fence yields just the body.
   */
  alwaysEmit?: boolean;
}

const FRONTMATTER_FENCE = '---';

/** Detect the line ending used in the source. Mixed input falls back to LF. */
export function detectLineEnding(content: string): LineEnding {
  // Use the first newline we encounter; if it's preceded by \r, it's CRLF.
  const nlIdx = content.indexOf('\n');
  if (nlIdx === -1) return 'lf';
  return content[nlIdx - 1] === '\r' ? 'crlf' : 'lf';
}

function toLf(content: string): string {
  return content.includes('\r') ? content.replace(/\r\n/g, '\n').replace(/\r/g, '\n') : content;
}

function withLineEnding(lfContent: string, ending: LineEnding): string {
  return ending === 'crlf' ? lfContent.replace(/\n/g, '\r\n') : lfContent;
}

/**
 * Parse a markdown document into its frontmatter object and body.
 *
 * Rules:
 * - A frontmatter block is `---\n<yaml>\n---\n` (or `\r\n` variants) **at the very start** of input.
 *   A leading BOM is tolerated.
 * - An empty frontmatter (`---\n---\n`) yields `{}` and `hasFrontmatter: true`.
 * - No fence → `{}`, `hasFrontmatter: false`, body = full content (LF-normalized).
 * - The closing fence line, plus exactly one trailing newline if present, is consumed; any further newlines are part of the body.
 */
export function parseFrontmatter(content: string): ParsedMarkdown {
  const lineEnding = detectLineEnding(content);
  // Strip BOM if present.
  const stripped = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const normalized = toLf(stripped);

  // Must open with `---` followed by newline (or EOF terminator after).
  if (!normalized.startsWith(FRONTMATTER_FENCE)) {
    return { frontmatter: {}, body: normalized, hasFrontmatter: false, lineEnding };
  }

  // The opening fence line: `---` then either `\n` or end-of-string. Anything else (e.g. `--- foo`) → not frontmatter.
  const afterFenceIdx = FRONTMATTER_FENCE.length;
  const nextChar = normalized[afterFenceIdx];
  if (nextChar !== '\n' && nextChar !== undefined) {
    return { frontmatter: {}, body: normalized, hasFrontmatter: false, lineEnding };
  }
  if (nextChar === undefined) {
    // Only `---` with nothing after. Treat as not-frontmatter (degenerate, but body-preserving).
    return { frontmatter: {}, body: normalized, hasFrontmatter: false, lineEnding };
  }

  const yamlStart = afterFenceIdx + 1; // past the opening fence's \n
  const rest = normalized.slice(yamlStart);

  // The closing fence is a line consisting solely of `---`. It may be the very first content
  // after the opening fence (empty frontmatter) or follow at least one YAML line.
  let yamlText: string;
  let afterFenceLineEnd: number;
  if (rest.startsWith('---') && (rest[3] === '\n' || rest[3] === undefined)) {
    yamlText = '';
    afterFenceLineEnd = yamlStart + 3;
  } else {
    const closingPattern = /\n---(?=\n|$)/;
    const closingMatch = closingPattern.exec(rest);
    if (!closingMatch) {
      // Unterminated fence: treat as no-frontmatter to preserve content.
      return { frontmatter: {}, body: normalized, hasFrontmatter: false, lineEnding };
    }
    yamlText = rest.slice(0, closingMatch.index);
    afterFenceLineEnd = yamlStart + closingMatch.index + closingMatch[0].length;
  }

  // Consume exactly one newline after the closing fence (the "fence-terminating" newline).
  let bodyStart = afterFenceLineEnd;
  if (normalized[bodyStart] === '\n') bodyStart += 1;
  const body = normalized.slice(bodyStart);

  let frontmatter: Record<string, unknown> = {};
  if (yamlText.trim() !== '') {
    const parsed = yamlParse(yamlText) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      frontmatter = parsed as Record<string, unknown>;
    } else if (parsed !== null && parsed !== undefined) {
      throw new Error('Frontmatter root must be a YAML mapping');
    }
  }

  return { frontmatter, body, hasFrontmatter: true, lineEnding };
}

/**
 * Serialize an in-memory document back to markdown.
 *
 * - Emits `---\n<yaml>\n---\n<body>` when the frontmatter object is non-empty (or `alwaysEmit`).
 * - Omits the fence entirely when frontmatter is empty and `alwaysEmit` is false.
 * - Applies the chosen line ending across the whole output. Default `lf`.
 */
export function serializeFrontmatter(
  frontmatter: Record<string, unknown>,
  body: string,
  opts: SerializeOptions = {},
): string {
  const ending: LineEnding = opts.lineEnding ?? 'lf';
  const lfBody = toLf(body);

  const hasContent = Object.keys(frontmatter).length > 0;
  const shouldEmit = hasContent || opts.alwaysEmit === true;

  if (!shouldEmit) {
    return withLineEnding(lfBody, ending);
  }

  let yamlBlock = '';
  if (hasContent) {
    const yamlText = yamlStringify(frontmatter, {
      // Stable defaults. `yaml`'s defaults already prefer block style and quote strings only when
      // necessary, which matches our fixture style.
      lineWidth: 0, // never auto-wrap long strings/arrays
    });
    yamlBlock = yamlText.endsWith('\n') ? yamlText : `${yamlText}\n`;
  }
  // Empty frontmatter forced via alwaysEmit collapses to `---\n---\n`; non-empty yields the
  // YAML between fences with the library-provided trailing newline.
  const composed = `${FRONTMATTER_FENCE}\n${yamlBlock}${FRONTMATTER_FENCE}\n${lfBody}`;
  return withLineEnding(composed, ending);
}
