/**
 * Process-local fixed-window rate limiter for authentication attempts
 * (Stage 8.3).
 *
 * LIMITATION — single instance only: counters live in this Node process's
 * memory. The current Render deployment runs exactly one instance, so the
 * configured limits hold there. If the app is ever scaled horizontally each
 * process keeps its own counters and the effective limit multiplies by the
 * instance count. This is deliberately NOT distributed rate limiting (no
 * Redis/external store — see the Stage 8.3 scope rules).
 *
 * Privacy: buckets store only a counter and a reset timestamp, keyed by
 * caller-derived strings (IP, normalized email). Passwords and other
 * credentials must never be passed into a key.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Whole seconds until the window resets; 0 when allowed. */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Hard cap on live keys so a flood of distinct emails cannot grow memory. */
export const RATE_LIMIT_MAX_BUCKETS = 5_000;

/**
 * Register one attempt against `key`. The first attempt opens a fixed window
 * of `windowMs`; attempts after `limit` within that window are denied.
 * `now` is injectable for deterministic tests.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: number = Date.now(),
): RateLimitDecision {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    prune(now);
    enforceCap();
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/**
 * Drop expired buckets. Called when a new key is inserted, so memory stays
 * bounded without timers.
 */
function prune(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Enforce the hard cap by evicting the longest-standing keys (Map iterates
 * in insertion order) before a new bucket is added, so the live key count
 * never exceeds RATE_LIMIT_MAX_BUCKETS even under a flood of distinct keys.
 */
function enforceCap(): void {
  while (buckets.size >= RATE_LIMIT_MAX_BUCKETS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
}

/** Live key count — diagnostics and tests. */
export function rateLimitBucketCount(): number {
  return buckets.size;
}

/** Live keys — diagnostics and tests (keys never contain credentials). */
export function listRateLimitKeys(): string[] {
  return [...buckets.keys()];
}

/** Clear all counters. Tests only. */
export function resetRateLimitState(): void {
  buckets.clear();
}
