import type { NextApiRequest, NextApiResponse } from 'next';

import { isDbEnabled, query } from './db';
import { clientIp, deviceFingerprint } from './request';
import { recordSecurityAlert } from './securityAlerts';
import { DEFAULT_RATE_LIMITS, getRateLimits, type RateRule } from './settings';
import { ApiError } from './users';

export type RateBucket = 'signup' | 'login' | 'api';

// Every request is checked against TWO windows that must BOTH pass:
//  1. IP + device fingerprint — the precise, per-client limit (the product
//     requirement, e.g. signup 3/hour).
//  2. IP only, at a looser multiple — a safety net so an attacker can't bypass
//     limit (1) by rotating the client-supplied x-device-id from a single IP.
//     The multiple keeps shared-NAT users (many devices, one IP) working.
const IP_ONLY_MULTIPLIER = 10;

// In-memory fallback store (used when no DATABASE_URL). A sliding window of
// timestamps per key. Adequate for a single instance / local dev; production
// serverless uses the DB-backed window so limits hold across instances.
type MemWindow = number[];
const globalRef = globalThis as unknown as { __ultronRateMem?: Map<string, MemWindow> };
function mem(): Map<string, MemWindow> {
  if (!globalRef.__ultronRateMem) globalRef.__ultronRateMem = new Map();
  return globalRef.__ultronRateMem;
}

type Check = { key: string; rule: RateRule };

// Build the set of (key, rule) pairs a request must satisfy for a bucket.
function checksFor(req: NextApiRequest, bucket: RateBucket, rule: RateRule): Check[] {
  const ip = clientIp(req);
  const device = deviceFingerprint(req);
  return [
    { key: `${bucket}|dev|${ip}|${device}`, rule },
    { key: `${bucket}|ip|${ip}`, rule: { max: rule.max * IP_ONLY_MULTIPLIER, windowSec: rule.windowSec } },
  ];
}

// --- in-memory backend ------------------------------------------------------

function memCount(key: string, windowMs: number, now: number): number {
  const events = (mem().get(key) ?? []).filter((t) => now - t < windowMs);
  mem().set(key, events);
  return events.length;
}

function memRecord(key: string, now: number): void {
  const events = mem().get(key) ?? [];
  events.push(now);
  mem().set(key, events);
}

// --- postgres backend -------------------------------------------------------

async function dbCount(key: string, windowSec: number): Promise<number> {
  const res = await query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM rate_events
     WHERE key = $1 AND ts > now() - ($2::text || ' seconds')::interval`,
    [key, String(windowSec)],
  );
  return Number(res.rows[0]?.n ?? '0');
}

async function dbRecord(key: string, windowSec: number): Promise<void> {
  await query('INSERT INTO rate_events (bucket, key) VALUES ($1, $2)', ['', key]);
  // Opportunistic cleanup of expired rows for this key.
  await query(
    `DELETE FROM rate_events WHERE key = $1 AND ts < now() - ($2::text || ' seconds')::interval`,
    [key, String(windowSec)],
  );
}

// Records a hit and returns whether it is allowed under ALL windows for the
// bucket. Counts every window first, and only records if all are under cap, so a
// rejected request doesn't consume quota. Fails open on unexpected storage
// errors (never lock legitimate users out because the backend hiccuped).
export async function checkRateLimit(req: NextApiRequest, bucket: RateBucket): Promise<boolean> {
  const now = Date.now();
  try {
    const rules = await getRateLimits();
    const checks = checksFor(req, bucket, rules[bucket]);
    if (isDbEnabled()) {
      for (const c of checks) {
        if ((await dbCount(c.key, c.rule.windowSec)) >= c.rule.max) return false;
      }
      for (const c of checks) await dbRecord(c.key, c.rule.windowSec);
    } else {
      for (const c of checks) {
        if (memCount(c.key, c.rule.windowSec * 1000, now) >= c.rule.max) return false;
      }
      for (const c of checks) memRecord(c.key, now);
    }
    return true;
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
    const rules = await getRateLimits().catch(() => DEFAULT_RATE_LIMITS);
    res.setHeader('Retry-After', String(rules[bucket].windowSec));
    await recordSecurityAlert({
      kind: 'rate_limit',
      ip: clientIp(req),
      device: deviceFingerprint(req),
      bucket,
      detail:
        bucket === 'signup'
          ? 'Signup attempts exceeded the configured limit.'
          : `Rate limit exceeded on the ${bucket} endpoint.`,
    });
    throw new ApiError(429, 'Too many requests. Please slow down and try again later.');
  }
}
