export {
  parseFrontmatter,
  serializeFrontmatter,
  detectLineEnding,
  type ParsedMarkdown,
  type SerializeOptions,
  type LineEnding,
} from './frontmatter';

export {
  findLineByBlockRef,
  replaceLine,
  insertLine,
  removeLine,
  BlockRefNotFoundError,
  AmbiguousBlockRefError,
  type InsertAnchor,
} from './lines';
