import { ensureSchema, isDbEnabled, query } from './db';

// Super-admin-tunable limits. `signup` is deliberately locked to a hard default
// of 3 requests/hour (the product requirement) but remains overridable by a
// super admin. Each rule is "at most `max` requests per `windowSec` seconds"
// per distinct key (IP + device fingerprint).
export type RateRule = { max: number; windowSec: number };

export type RateLimitSettings = {
  signup: RateRule;
  login: RateRule;
  api: RateRule;
};

export const DEFAULT_RATE_LIMITS: RateLimitSettings = {
  // Hardcoded product requirement: 3 signup attempts per hour.
  signup: { max: 3, windowSec: 60 * 60 },
  login: { max: 10, windowSec: 15 * 60 },
  api: { max: 300, windowSec: 60 },
};

const globalRef = globalThis as unknown as { __ultronSettings?: RateLimitSettings };

function sanitizeRule(input: unknown, fallback: RateRule): RateRule {
  if (!input || typeof input !== 'object') return fallback;
  const obj = input as Record<string, unknown>;
  const max = Number(obj.max);
  const windowSec = Number(obj.windowSec);
  return {
    max: Number.isFinite(max) && max >= 1 && max <= 100000 ? Math.floor(max) : fallback.max,
    windowSec:
      Number.isFinite(windowSec) && windowSec >= 1 && windowSec <= 86400
        ? Math.floor(windowSec)
        : fallback.windowSec,
  };
}

export function sanitizeSettings(input: unknown): RateLimitSettings {
  const obj = (input ?? {}) as Record<string, unknown>;
  return {
    signup: sanitizeRule(obj.signup, DEFAULT_RATE_LIMITS.signup),
    login: sanitizeRule(obj.login, DEFAULT_RATE_LIMITS.login),
    api: sanitizeRule(obj.api, DEFAULT_RATE_LIMITS.api),
  };
}

export async function getRateLimits(): Promise<RateLimitSettings> {
  if (!isDbEnabled()) {
    return globalRef.__ultronSettings ?? DEFAULT_RATE_LIMITS;
  }
  await ensureSchema();
  const res = await query<{ data: unknown }>('SELECT data FROM app_settings WHERE id = 1');
  const stored = res.rows[0]?.data as Record<string, unknown> | undefined;
  return sanitizeSettings(stored?.rateLimits);
}

export async function setRateLimits(next: RateLimitSettings): Promise<RateLimitSettings> {
  const clean = sanitizeSettings(next);
  if (!isDbEnabled()) {
    globalRef.__ultronSettings = clean;
    return clean;
  }
  await ensureSchema();
  await query(
    `INSERT INTO app_settings (id, data, updated_at)
     VALUES (1, jsonb_build_object('rateLimits', $1::jsonb), now())
     ON CONFLICT (id) DO UPDATE SET data = app_settings.data || jsonb_build_object('rateLimits', $1::jsonb), updated_at = now()`,
    [JSON.stringify(clean)],
  );
  return clean;
}
