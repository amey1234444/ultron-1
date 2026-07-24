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
// Reject anything below this Abstract "email_quality.score" (0.01–0.99).
const MIN_QUALITY_SCORE = 0.3;

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
  if (score !== null && score < MIN_QUALITY_SCORE) reasons.push(`Low quality score (${score}).`);

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

// --- rejected-email reputation store ---------------------------------------

export type RejectedEmail = {
  id: string;
  email: string;
  reasons: string[];
  detail: string;
  overridden: boolean;
  createdAt: string;
  data: unknown | null;
};

type MemRejected = RejectedEmail & { emailLc: string };
const globalRef = globalThis as unknown as { __ultronRejectedEmails?: MemRejected[] };
function mem(): MemRejected[] {
  if (!globalRef.__ultronRejectedEmails) globalRef.__ultronRejectedEmails = [];
  return globalRef.__ultronRejectedEmails;
}

// Look up a rejected entry by email. Returns undefined if none. An entry whose
// `overridden` is true means a super admin manually cleared the reputation
// decision, so signup should be allowed to proceed (without re-calling the API).
export async function findRejectedEmail(email: string): Promise<RejectedEmail | undefined> {
  const key = normalizeEmail(email);
  if (!key) return undefined;
  if (!isDbEnabled()) {
    const found = mem().find((r) => r.emailLc === key);
    if (!found) return undefined;
    const { emailLc: _emailLc, ...rest } = found;
    return rest;
  }
  const res = await query<RejectedRow>('SELECT * FROM rejected_email_reputation WHERE email_lc = $1', [key]);
  return res.rows[0] ? rowToRejected(res.rows[0]) : undefined;
}

// Persist a not-acceptable email + the full API response. Idempotent on email:
// a repeat rejection refreshes the stored response/reasons.
export async function addRejectedEmail(email: string, reasons: string[], data: unknown): Promise<void> {
  const emailLc = normalizeEmail(email);
  const detail = reasons.join(' ');
  try {
    if (!isDbEnabled()) {
      const store = mem();
      const existing = store.find((r) => r.emailLc === emailLc);
      if (existing) {
        existing.reasons = reasons;
        existing.detail = detail;
        existing.data = data ?? null;
        return;
      }
      const now = Date.now();
      store.unshift({
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        email: email.trim(),
        emailLc,
        reasons,
        detail,
        overridden: false,
        createdAt: new Date(now).toISOString(),
        data: data ?? null,
      });
      return;
    }
    await query(
      `INSERT INTO rejected_email_reputation (email, email_lc, reasons, detail, response)
       VALUES ($1, $2, $3::jsonb, $4, $5::jsonb)
       ON CONFLICT (email_lc) DO UPDATE
         SET reasons = EXCLUDED.reasons, detail = EXCLUDED.detail, response = EXCLUDED.response`,
      [email.trim(), emailLc, JSON.stringify(reasons), detail, JSON.stringify(data ?? null)],
    );
  } catch (err) {
    logServerError('addRejectedEmail', err);
  }
}

export async function listRejectedEmails(limit = 200): Promise<{ rejected: RejectedEmail[]; active: number }> {
  const cap = Math.min(Math.max(1, Math.floor(limit)), 500);
  if (!isDbEnabled()) {
    const store = mem();
    return {
      rejected: store.slice(0, cap).map(({ emailLc: _emailLc, ...r }) => r),
      active: store.filter((r) => !r.overridden).length,
    };
  }
  const res = await query<RejectedRow>('SELECT * FROM rejected_email_reputation ORDER BY created_at DESC LIMIT $1', [cap]);
  const countRes = await query<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM rejected_email_reputation WHERE overridden_at IS NULL',
  );
  return { rejected: res.rows.map(rowToRejected), active: Number(countRes.rows[0]?.n ?? '0') };
}

// Manual super-admin override: mark the reputation decision as cleared so the
// email becomes eligible to register again (signup will skip the API for it).
export async function overrideRejectedEmail(id: string): Promise<void> {
  if (!isDbEnabled()) {
    const found = mem().find((r) => r.id === id);
    if (found) found.overridden = true;
    return;
  }
  await query('UPDATE rejected_email_reputation SET overridden_at = now() WHERE id = $1', [id]);
}

export async function deleteRejectedEmail(id: string): Promise<void> {
  if (!isDbEnabled()) {
    const store = mem();
    const idx = store.findIndex((r) => r.id === id);
    if (idx !== -1) store.splice(idx, 1);
    return;
  }
  await query('DELETE FROM rejected_email_reputation WHERE id = $1', [id]);
}

type RejectedRow = {
  id: string;
  email: string;
  reasons: unknown;
  detail: string;
  response: unknown;
  overridden_at: Date | string | null;
  created_at: Date | string;
};

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function rowToRejected(r: RejectedRow): RejectedEmail {
  return {
    id: String(r.id),
    email: r.email,
    reasons: Array.isArray(r.reasons) ? (r.reasons as string[]) : [],
    detail: r.detail,
    overridden: r.overridden_at !== null,
    createdAt: iso(r.created_at),
    data: r.response ?? null,
  };
}
