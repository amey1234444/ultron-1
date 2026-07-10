import crypto from 'crypto';

import type { NextApiRequest } from 'next';

// Best-effort client IP. Behind Vercel / proxies the real client is the first
// entry of x-forwarded-for; fall back to the socket address for direct hits.
export function clientIp(req: NextApiRequest): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  if (raw) {
    const first = raw.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real;
  return req.socket?.remoteAddress || 'unknown';
}

// Stable-ish device fingerprint: combine the client-supplied device id (a random
// id the browser persists in localStorage and sends as x-device-id) with the
// user-agent. This is advisory — never a security boundary on its own — but
// combined with IP it meaningfully raises the cost of mass automated signups.
export function deviceFingerprint(req: NextApiRequest): string {
  const deviceId = headerValue(req, 'x-device-id') || '';
  const ua = headerValue(req, 'user-agent') || '';
  const basis = `${deviceId}|${ua}`;
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 32);
}

function headerValue(req: NextApiRequest, name: string): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}
