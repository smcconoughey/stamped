/**
 * Simple in-memory sliding-window rate limiter.
 * No external dependencies — works on single-instance deployments (Render).
 *
 * For multi-instance setups, swap this for Upstash or Redis-backed limiting.
 */

interface Entry {
  timestamps: number[];
}

const store = new Map<string, Entry>();

// Evict stale keys every 5 minutes to prevent memory growth
const CLEANUP_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1] < now - 15 * 60 * 1000) {
      store.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

/**
 * Check whether a request identified by `key` is within the rate limit.
 *
 * @param key       Unique identifier (e.g. IP address or email)
 * @param limit     Maximum requests allowed within `windowMs`
 * @param windowMs  Time window in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Drop timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = oldest + windowMs - now;
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.timestamps.push(now);
  return { allowed: true, remaining: limit - entry.timestamps.length, retryAfterMs: 0 };
}
