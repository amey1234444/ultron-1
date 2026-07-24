import { isDbEnabled, query } from './db';
import { logServerError } from './errors';

// Security alarms surfaced to super admins on the User Management page:
//  - `duplicate_email`: a signup was attempted with an already-registered email
//    (probing / mass-account abuse).
//  - `rate_limit`: a caller exceeded a configured rate limit. The `bucket`
//    distinguishes signup-limit breaches ('signup') from general API abuse.
export type SecurityAlertKind = 'duplicate_email' | 'rate_limit';

export type SecurityAlert = {
  id: string;
  kind: SecurityAlertKind;
  email: string;
  ip: string;
  device: string;
  bucket: string;
  detail: string;
  acknowledged: boolean;
  createdAt: string;
};

export type SecurityAlertInput = {
  kind: SecurityAlertKind;
  email?: string;
  ip?: string;
  device?: string;
  bucket?: string;
  detail?: string;
};

// Collapse bursts: once an alert for the same (kind, email, ip, bucket) is
// recorded, identical follow-ups within this window are ignored so an attacker
// hammering an endpoint can't flood the alarms table.
const DEDUP_WINDOW_SEC = 300;
const MAX_ALERTS = 200;

type MemAlert = SecurityAlert & { createdAtMs: number };
const globalRef = globalThis as unknown as { __ultronSecurityAlerts?: MemAlert[] };
function mem(): MemAlert[] {
  if (!globalRef.__ultronSecurityAlerts) globalRef.__ultronSecurityAlerts = [];
  return globalRef.__ultronSecurityAlerts;
}

function dedupKey(input: SecurityAlertInput): string {
  return [input.kind, input.email ?? '', input.ip ?? '', input.bucket ?? ''].join('|');
}

// Best-effort: alarms are observability, never a request-blocking dependency, so
// every path swallows storage errors (logged) rather than propagating them.
export async function recordSecurityAlert(input: SecurityAlertInput): Promise<void> {
  const email = (input.email ?? '').trim().toLowerCase();
  const ip = input.ip ?? '';
  const device = input.device ?? '';
  const bucket = input.bucket ?? '';
  const detail = input.detail ?? '';
  try {
    if (!isDbEnabled()) {
      const now = Date.now();
      const store = mem();
      const dup = store.some(
        (a) => dedupKey(a) === dedupKey({ ...input, email }) && now - a.createdAtMs < DEDUP_WINDOW_SEC * 1000,
      );
      if (dup) return;
      store.unshift({
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        kind: input.kind,
        email,
        ip,
        device,
        bucket,
        detail,
        acknowledged: false,
        createdAt: new Date(now).toISOString(),
        createdAtMs: now,
      });
      if (store.length > MAX_ALERTS) store.length = MAX_ALERTS;
      return;
    }
    const recent = await query(
      `SELECT 1 FROM security_alerts
       WHERE kind = $1 AND email = $2 AND ip = $3 AND bucket = $4
         AND created_at > now() - ($5::text || ' seconds')::interval
       LIMIT 1`,
      [input.kind, email, ip, bucket, String(DEDUP_WINDOW_SEC)],
    );
    if ((recent.rowCount ?? 0) > 0) return;
    await query(
      `INSERT INTO security_alerts (kind, email, ip, device, bucket, detail)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [input.kind, email, ip, device, bucket, detail],
    );
  } catch (err) {
    logServerError('recordSecurityAlert', err);
  }
}

type AlertRow = {
  id: string;
  kind: string;
  email: string;
  ip: string;
  device: string;
  bucket: string;
  detail: string;
  acknowledged_at: Date | string | null;
  created_at: Date | string;
};

function iso(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function rowToAlert(r: AlertRow): SecurityAlert {
  return {
    id: String(r.id),
    kind: (r.kind === 'duplicate_email' || r.kind === 'rate_limit' ? r.kind : 'rate_limit') as SecurityAlertKind,
    email: r.email,
    ip: r.ip,
    device: r.device,
    bucket: r.bucket,
    detail: r.detail,
    acknowledged: r.acknowledged_at !== null,
    createdAt: iso(r.created_at),
  };
}

export async function listSecurityAlerts(limit = 100): Promise<{ alerts: SecurityAlert[]; unacknowledged: number }> {
  const cap = Math.min(Math.max(1, Math.floor(limit)), MAX_ALERTS);
  if (!isDbEnabled()) {
    const store = mem();
    return {
      alerts: store.slice(0, cap).map(({ createdAtMs: _createdAtMs, ...a }) => a),
      unacknowledged: store.filter((a) => !a.acknowledged).length,
    };
  }
  const res = await query<AlertRow>('SELECT * FROM security_alerts ORDER BY created_at DESC LIMIT $1', [cap]);
  const countRes = await query<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM security_alerts WHERE acknowledged_at IS NULL',
  );
  return {
    alerts: res.rows.map(rowToAlert),
    unacknowledged: Number(countRes.rows[0]?.n ?? '0'),
  };
}

// Mark every outstanding alarm as reviewed (clears the super-admin badge).
export async function acknowledgeAllSecurityAlerts(): Promise<void> {
  if (!isDbEnabled()) {
    for (const a of mem()) a.acknowledged = true;
    return;
  }
  await query('UPDATE security_alerts SET acknowledged_at = now() WHERE acknowledged_at IS NULL');
}
