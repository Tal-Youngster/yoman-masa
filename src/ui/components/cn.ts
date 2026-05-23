/** Tiny class-name joiner. No external dependency until we need one. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
