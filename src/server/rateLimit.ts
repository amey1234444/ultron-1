import type { NextApiRequest, NextApiResponse } from 'next';

import { isDbEnabled, query } from './db';
import { clientIp, deviceFingerprint } from './request';
import { getRateLimits, type RateRule } from './settings';
import { ApiError } from './users';

export type RateBucket = 'signup' | 'login' | 'api';

// In-memory fallback store (used when no DATABASE_URL). A sliding window of
// timestamps per key. Adequate for a single instance / local dev; production
// serverless uses the DB-backed window so limits hold across instances.
type MemWindow = number[];
const globalRef = globalThis as unknown as { __ultronRateMem?: Map<string, MemWindow> };
function mem(): Map<string, MemWindow> {
  if (!globalRef.__ultronRateMem) globalRef.__ultronRateMem = new Map();
  return globalRef.__ultronRateMem;
}

// A request is keyed by IP *and* device fingerprint together, so hammering from
// one machine behind changing IPs (or one IP spoofing many device ids) still
// collapses onto a limited set of buckets.
function keyFor(req: NextApiRequest): string {
  return `${clientIp(req)}|${deviceFingerprint(req)}`;
}

async function hitMem(bucket: RateBucket, key: string, rule: RateRule): Promise<boolean> {
  const now = Date.now();
  const windowMs = rule.windowSec * 1000;
  const mapKey = `${bucket}:${key}`;
  const store = mem();
  const events = (store.get(mapKey) ?? []).filter((t) => now - t < windowMs);
  if (events.length >= rule.max) {
    store.set(mapKey, events);
    return false;
  }
  events.push(now);
  store.set(mapKey, events);
  return true;
}

async function hitDb(bucket: RateBucket, key: string, rule: RateRule): Promise<boolean> {
  // Count events in the window, then insert if under the cap. Not a hard atomic
  // guarantee under extreme concurrency, but more than sufficient to throttle
  // abuse and it holds across serverless instances.
  const res = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM rate_events
     WHERE bucket = $1 AND key = $2 AND ts > now() - ($3::text || ' seconds')::interval`,
    [bucket, key, String(rule.windowSec)],
  );
  const count = Number(res.rows[0]?.n ?? '0');
  if (count >= rule.max) return false;
  await query('INSERT INTO rate_events (bucket, key) VALUES ($1, $2)', [bucket, key]);
  // Opportunistic cleanup of old rows for this key.
  await query(
    `DELETE FROM rate_events WHERE bucket = $1 AND key = $2 AND ts < now() - ($3::text || ' seconds')::interval`,
    [bucket, key, String(rule.windowSec)],
  );
  return true;
}

// Records a hit and returns whether it is allowed under the current rule for the
// bucket. Fails open on unexpected storage errors (never lock legitimate users
// out because the limiter backend hiccuped).
export async function checkRateLimit(req: NextApiRequest, bucket: RateBucket): Promise<boolean> {
  const rules = await getRateLimits();
  const rule = rules[bucket];
  const key = keyFor(req);
  try {
    return isDbEnabled() ? await hitDb(bucket, key, rule) : await hitMem(bucket, key, rule);
  } catch {
    return true;
  }
}

// Throws ApiError(429) with a Retry-After header when the caller is over the
// limit for `bucket`. Call at the top of a handler.
export async function enforceRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  bucket: RateBucket,
): Promise<void> {
  const allowed = await checkRateLimit(req, bucket);
  if (!allowed) {
    const rules = await getRateLimits();
    res.setHeader('Retry-After', String(rules[bucket].windowSec));
    throw new ApiError(429, 'Too many requests. Please slow down and try again later.');
  }
}
