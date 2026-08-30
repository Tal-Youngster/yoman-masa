/**
 * The one retry curve, shared by the pass scheduler in `engine.ts` and the
 * per-item scheduler in the Dexie write queue (ADR-0019).
 *
 * Deliberately deterministic — no jitter. Jitter exists to de-synchronize a
 * fleet of clients hitting a shared backend; this app has exactly one client
 * per user talking to that user's own Drive, so randomness would buy nothing
 * and cost test reproducibility.
 */

/** Attempts before a write queue row is retired as dead. */
export const MAX_ATTEMPTS = 5;

const BASE_MS = 1_000;
const CEILING_MS = 60_000;

/**
 * Delay before attempt `attempts + 1`, given how many have already failed.
 * `0 → 1s, 1 → 2s, 2 → 4s, 3 → 8s, 4 → 16s`, capped at 60s.
 */
export function backoffMs(attempts: number): number {
  if (attempts <= 0) return BASE_MS;
  // Cap the exponent before shifting so a pathological attempt count can't
  // overflow into a negative or zero delay (which would busy-loop).
  const exponent = Math.min(attempts, 30);
  return Math.min(CEILING_MS, BASE_MS * 2 ** exponent);
}
