import { isDbEnabled, query } from './db';
import { logServerError } from './errors';

// Email reputation gate for self-service signup, backed by Abstract's Email
// Reputation API (https://emailreputation.abstractapi.com/v1/). The flow that
// consumes this module (see api/auth/signup.ts) is:
//
//   1. Email already a registered user?           -> normal duplicate handling.
//   2. Email in the rejected-reputation table?    -> reject immediately, NO API
//                                                    call (saves credits).
//   3. Otherwise call the API, store the full
//      response, and decide:
//        - acceptable      -> allow signup, stamp reputation on the user record.
//        - not acceptable  -> reject signup, store email + full response in the
//                             rejected-reputation table.
//
// Availability first: if the API key is missing, or the API errors / times out /
// is rate-limited, we FAIL OPEN (status 'unknown') so signups are never blocked
// by an outage. Super admins can still see the 'unknown' status in Manage Users.

export type ReputationStatus = 'acceptable' | 'not_acceptable' | 'unknown' | 'overridden';

// Structured, JSON-serialisable reputation record. `data` holds the complete raw
// API response for auditing / the super-admin detail view.
export type ReputationResult = {
  status: ReputationStatus;
  score: number | null;
  reasons: string[];
  checkedAt: string;
  data: unknown | null;
};

const API_URL = 'https://emailreputation.abstractapi.com/v1/';
const API_TIMEOUT_MS = 8000;
// An email is considered valid / trustable only when Abstract's
// "email_quality.score" is ABOVE this threshold; anything at or below it is
// rejected. Scores range 0.01–0.99.
export const MIN_QUALITY_SCORE = 0.85;

function apiKey(): string {
  return process.env.ABSTRACT_EMAIL_REPUTATION_API_KEY || process.env.ABSTRACT_API_KEY || '';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Shape of the subset of the Abstract response we actually inspect. Everything
// is optional/nullable because the API returns nulls for malformed emails.
type AbstractResponse = {
  email_deliverability?: { status?: string | null; is_format_valid?: boolean | null } | null;
  email_quality?: {
    score?: number | null;
    is_disposable?: boolean | null;
    is_username_suspicious?: boolean | null;
  } | null;
  email_risk?: { address_risk_status?: string | null; domain_risk_status?: string | null } | null;
};

// Turn a raw API response into an accept/reject decision plus human-readable
// reasons (shown to super admins). Conservative: any strong negative signal
// rejects; a missing / unparseable field never rejects on its own.
export function evaluateReputation(raw: unknown): { acceptable: boolean; score: number | null; reasons: string[] } {
  const r = (raw ?? {}) as AbstractResponse;
  const reasons: string[] = [];

  const deliverability = r.email_deliverability?.status ?? null;
  const isFormatValid = r.email_deliverability?.is_format_valid;
  const quality = r.email_quality ?? {};
  const score = typeof quality.score === 'number' ? quality.score : null;
  const addressRisk = r.email_risk?.address_risk_status ?? null;
  const domainRisk = r.email_risk?.domain_risk_status ?? null;

  if (isFormatValid === false) reasons.push('Email format is invalid.');
  if (deliverability === 'undeliverable') reasons.push('Email is undeliverable.');
  if (quality.is_disposable === true) reasons.push('Disposable email address.');
  if (quality.is_username_suspicious === true) reasons.push('Username looks auto-generated / suspicious.');
  if (addressRisk === 'high') reasons.push('High address risk.');
  if (domainRisk === 'high') reasons.push('High domain risk.');
  if (score !== null && score <= MIN_QUALITY_SCORE) {
    reasons.push(`Low quality score (${score}); must be above ${MIN_QUALITY_SCORE} to be trusted.`);
  }

  return { acceptable: reasons.length === 0, score, reasons };
}

// Outcome of a single Abstract API call. On failure we keep a structured,
// key-free diagnostic so the reason is persisted on the user record and shown
// to super admins instead of a silent, empty "unchecked".
type ApiOutcome =
  | { ok: true; data: unknown }
  | { ok: false; detail: string; diagnostic: Record<string, unknown> };

// Pull Abstract's `{ error: { message, code } }` body (returned on 4xx/5xx and,
// defensively, sometimes alongside a 200) into a short, safe summary. Never
// includes the request URL or API key.
function abstractErrorInfo(body: unknown): { code: string | null; message: string | null } {
  const e = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  if (!e || typeof e !== 'object') return { code: null, message: null };
  return {
    code: typeof e.code === 'string' ? e.code : null,
    message: typeof e.message === 'string' ? e.message : null,
  };
}

// Call the Abstract API. Returns the parsed JSON on success, or a STRUCTURED
// failure (missing key, network error, timeout, non-2xx, error body) so callers
// can fail open WHILE recording exactly why the check did not complete.
async function callReputationApi(email: string): Promise<ApiOutcome> {
  const key = apiKey();
  if (!key) {
    return {
      ok: false,
      detail: 'Reputation API key is not configured.',
      diagnostic: {
        reason: 'missing_api_key',
        hint: 'Set ABSTRACT_EMAIL_REPUTATION_API_KEY in the deployment environment and redeploy.',
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const url = `${API_URL}?api_key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`;
    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      const { code, message } = abstractErrorInfo(body);
      logServerError('emailReputation api non-2xx', new Error(`status ${res.status} ${code ?? ''}`.trim()));
      return {
        ok: false,
        detail: message ?? `Reputation service returned HTTP ${res.status}.`,
        diagnostic: { reason: 'http_error', httpStatus: res.status, code, message },
      };
    }
    // Some error conditions arrive as HTTP 200 with an `error` body — treat as
    // a failure so we never mistake an error payload for a real verdict.
    const { code, message } = abstractErrorInfo(body);
    if (code || message) {
      return {
        ok: false,
        detail: message ?? 'Reputation service returned an error.',
        diagnostic: { reason: 'api_error', code, message },
      };
    }
    return { ok: true, data: body };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    logServerError('emailReputation api call', err);
    return {
      ok: false,
      detail: timedOut ? 'Reputation service timed out.' : 'Reputation service is unreachable.',
      diagnostic: { reason: timedOut ? 'timeout' : 'network_error' },
    };
  } finally {
    clearTimeout(timer);
  }
}

// Run a full reputation check for an email that is NOT already in the rejected
// table. Fails open to status 'unknown' when the API can't be reached — but now
// persists a structured diagnostic (the reason) in `data` so the check is never
// a silent, empty "unchecked" with "No stored API response" in the super-admin
// view.
export async function checkEmailReputation(email: string): Promise<ReputationResult> {
  const checkedAt = new Date().toISOString();
  const outcome = await callReputationApi(email);
  if (!outcome.ok) {
    return {
      status: 'unknown',
      score: null,
      reasons: [outcome.detail],
      checkedAt,
      data: { unavailable: true, ...outcome.diagnostic, detail: outcome.detail, checkedAt },
    };
  }
  const { acceptable, score, reasons } = evaluateReputation(outcome.data);
  return { status: acceptable ? 'acceptable' : 'not_acceptable', score, reasons, checkedAt, data: outcome.data };
}

// --- unified reputation store ----------------------------------------------
//
// A single table (`email_reputation`) holds the LATEST verdict + the full
// Abstract API response for every email we have ever checked — acceptable,
// not_acceptable, unknown (provider unavailable) and manually overridden alike.
// It supersedes the old rejected-only table; the rejected-email helpers below
// are now thin filtered views over this unified table.

// Signup is allowed for every verdict except an active (non-overridden)
// rejection. `unknown` fails open (availability first).
export function isAllowed(status: ReputationStatus): boolean {
  return status !== 'not_acceptable';
}

// An email is "trustable" only when it was explicitly accepted with a quality
// score above the threshold (see MIN_QUALITY_SCORE).
export function isTrustable(status: ReputationStatus, score: number | null): boolean {
  return status === 'acceptable' && score !== null && score > MIN_QUALITY_SCORE;
}

export type ReputationRecord = {
  id: string;
  email: string;
  status: ReputationStatus;
  allowed: boolean;
  trustable: boolean;
  score: number | null;
  reasons: string[];
  detail: string;
  overridden: boolean;
  checkedAt: string | null;
  createdAt: string;
  updatedAt: string;
  data: unknown | null;
};

type MemReputation = ReputationRecord & { emailLc: string };
const globalRef = globalThis as unknown as { __ultronReputation?: MemReputation[] };
function mem(): MemReputation[] {
  if (!globalRef.__ultronReputation) globalRef.__ultronReputation = [];
  return globalRef.__ultronReputation;
}

// Upsert (keyed case-insensitively on email) the latest verdict + full API
// response. Called by the queue worker after every Abstract API call.
export async function recordReputation(email: string, result: ReputationResult): Promise<void> {
  const emailLc = normalizeEmail(email);
  if (!emailLc) return;
  const allowed = isAllowed(result.status);
  const detail = result.reasons.join(' ');
  try {
    if (!isDbEnabled()) {
      const store = mem();
      const nowIso = new Date().toISOString();
      const existing = store.find((r) => r.emailLc === emailLc);
      if (existing) {
        existing.email = email.trim();
        existing.status = result.status;
        existing.allowed = allowed;
        existing.trustable = isTrustable(result.status, result.score);
        existing.score = result.score;
        existing.reasons = result.reasons;
        existing.detail = detail;
        existing.checkedAt = result.checkedAt;
        existing.data = result.data ?? null;
        existing.updatedAt = nowIso;
        existing.overridden = result.status === 'overridden';
      } else {
        store.unshift({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          email: email.trim(),
          emailLc,
          status: result.status,
          allowed,
          trustable: isTrustable(result.status, result.score),
          score: result.score,
          reasons: result.reasons,
          detail,
          overridden: result.status === 'overridden',
          checkedAt: result.checkedAt,
          createdAt: nowIso,
          updatedAt: nowIso,
          data: result.data ?? null,
        });
      }
      return;
    }
    await query(
      `INSERT INTO email_reputation (email, email_lc, status, allowed, score, reasons, detail, checked_at, response)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::jsonb)
       ON CONFLICT (email_lc) DO UPDATE SET
         email = EXCLUDED.email,
         status = EXCLUDED.status,
         allowed = EXCLUDED.allowed,
         score = EXCLUDED.score,
         reasons = EXCLUDED.reasons,
         detail = EXCLUDED.detail,
         checked_at = EXCLUDED.checked_at,
         response = EXCLUDED.response,
         overridden_at = CASE WHEN EXCLUDED.status = 'overridden' THEN now() ELSE NULL END,
         updated_at = now()`,
      [
        email.trim(),
        emailLc,
        result.status,
        allowed,
        result.score,
        JSON.stringify(result.reasons),
        detail,
        result.checkedAt,
        JSON.stringify(result.data ?? null),
      ],
    );
  } catch (err) {
    logServerError('recordReputation', err);
  }
}

// Latest stored verdict for an email, or undefined if never checked.
export async function findReputation(email: string): Promise<ReputationRecord | undefined> {
  const key = normalizeEmail(email);
  if (!key) return undefined;
  if (!isDbEnabled()) {
    const found = mem().find((r) => r.emailLc === key);
    if (!found) return undefined;
    const { emailLc: _emailLc, ...rest } = found;
    return rest;
  }
  const res = await query<ReputationRow>('SELECT * FROM email_reputation WHERE email_lc = $1', [key]);
  return res.rows[0] ? rowToRecord(res.rows[0]) : undefined;
}

// Every stored record (acceptable + not_acceptable + unknown + overridden),
// most-recently-updated first, plus the count of active (barred) rejections.
export async function listReputationRecords(
  limit = 500,
): Promise<{ records: ReputationRecord[]; barred: number }> {
  const cap = Math.min(Math.max(1, Math.floor(limit)), 1000);
  if (!isDbEnabled()) {
    const store = mem();
    return {
      records: store.slice(0, cap).map(({ emailLc: _emailLc, ...r }) => r),
      barred: store.filter((r) => r.status === 'not_acceptable').length,
    };
  }
  const res = await query<ReputationRow>('SELECT * FROM email_reputation ORDER BY updated_at DESC LIMIT $1', [cap]);
  const countRes = await query<{ n: string }>(
    "SELECT COUNT(*)::text AS n FROM email_reputation WHERE status = 'not_acceptable'",
  );
  return { records: res.rows.map(rowToRecord), barred: Number(countRes.rows[0]?.n ?? '0') };
}

// Manual super-admin override: clear a rejection so the email may register
// again (signup will reuse this record and skip the API).
export async function overrideReputation(id: string): Promise<void> {
  if (!isDbEnabled()) {
    const found = mem().find((r) => r.id === id);
    if (found) {
      found.status = 'overridden';
      found.allowed = true;
      found.trustable = false;
      found.overridden = true;
      found.updatedAt = new Date().toISOString();
    }
    return;
  }
  await query(
    "UPDATE email_reputation SET status = 'overridden', allowed = true, overridden_at = now(), updated_at = now() WHERE id = $1",
    [id],
  );
}

export async function deleteReputation(id: string): Promise<void> {
  if (!isDbEnabled()) {
    const store = mem();
    const idx = store.findIndex((r) => r.id === id);
    if (idx !== -1) store.splice(idx, 1);
    return;
  }
  await query('DELETE FROM email_reputation WHERE id = $1', [id]);
}

type ReputationRow = {
  id: string;
  email: string;
  status: string;
  allowed: boolean;
  score: number | string | null;
  reasons: unknown;
  detail: string;
  response: unknown;
  checked_at: Date | string | null;
  overridden_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function isoOrNull(v: Date | string | null): string | null {
  return v === null ? null : iso(v);
}

function rowToRecord(r: ReputationRow): ReputationRecord {
  const status: ReputationStatus =
    r.status === 'acceptable' || r.status === 'not_acceptable' || r.status === 'overridden' ? r.status : 'unknown';
  const score = r.score === null || r.score === undefined ? null : Number(r.score);
  return {
    id: String(r.id),
    email: r.email,
    status,
    allowed: r.allowed,
    trustable: isTrustable(status, score),
    score,
    reasons: Array.isArray(r.reasons) ? (r.reasons as string[]) : [],
    detail: r.detail,
    overridden: r.overridden_at !== null,
    checkedAt: isoOrNull(r.checked_at),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    data: r.response ?? null,
  };
}
