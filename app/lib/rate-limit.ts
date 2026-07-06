// In-memory fixed-window rate limiter. Edge-runtime-safe (Map + Date.now()
// only). Suitable for the current single-instance Railway deployment: counters
// reset on redeploy and are per-instance — swap for a shared store (Redis)
// before scaling to multiple instances.

interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

// Bounded memory: when the map grows past this, expired windows are swept.
const SWEEP_THRESHOLD = 5000;

export interface RateLimitResult {
  limited: boolean;
  /** Seconds until the window resets — only meaningful when limited. */
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (windows.size > SWEEP_THRESHOLD) {
    windows.forEach((w, k) => {
      if (now >= w.resetAt) windows.delete(k);
    });
  }

  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { limited: false, retryAfterSec: 0 };
  }

  w.count++;
  if (w.count > limit) {
    return { limited: true, retryAfterSec: Math.max(1, Math.ceil((w.resetAt - now) / 1000)) };
  }
  return { limited: false, retryAfterSec: 0 };
}
