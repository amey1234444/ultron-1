import type { NextApiRequest, NextApiResponse } from 'next';

import { ApiError } from './users';

// --- CSRF / same-origin protection -----------------------------------------
//
// The session cookie is `SameSite=Lax`, which already blocks the classic
// cross-site form-POST CSRF. This adds a second, explicit layer: state-changing
// requests must originate from our own site. We compare the request's Origin
// (falling back to Referer) host against the Host the request arrived on. If a
// forbidden cross-origin caller is detected we reject with 403.
//
// Requests with no Origin/Referer at all (e.g. some same-origin GETs, curl,
// server-to-server) are allowed — only a *mismatching* origin is rejected — so
// legitimate non-browser clients still work while browsers can't be tricked
// into issuing authenticated cross-site writes.

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function hostFromUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

function requestHost(req: NextApiRequest): string | null {
  // Prefer the proxy-forwarded host (Vercel) then the raw Host header.
  const xfHost = req.headers['x-forwarded-host'];
  const forwarded = Array.isArray(xfHost) ? xfHost[0] : xfHost;
  const host = forwarded || req.headers.host;
  return host ? host.toLowerCase() : null;
}

export function assertSameOrigin(req: NextApiRequest): void {
  if (!MUTATING_METHODS.has((req.method || 'GET').toUpperCase())) return;

  const host = requestHost(req);
  if (!host) return; // cannot determine our own host; don't block

  const originHeader = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  const refererHeader = Array.isArray(req.headers.referer) ? req.headers.referer[0] : req.headers.referer;
  const sourceHost = hostFromUrl(originHeader) ?? hostFromUrl(refererHeader);

  // No Origin/Referer at all -> not a browser cross-site attack vector.
  if (!sourceHost) return;

  if (sourceHost !== host) {
    throw new ApiError(403, 'Cross-origin request blocked.');
  }
}

// --- CORS -------------------------------------------------------------------
//
// The API is same-origin only. We never emit `Access-Control-Allow-Origin: *`,
// so browsers block cross-origin reads by default. We still answer CORS
// preflights explicitly for our own origin (helps when the app is served from a
// custom domain) and reject everything else.

export function applyCors(req: NextApiRequest, res: NextApiResponse): boolean {
  const host = requestHost(req);
  const originHeader = Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin;
  const originHost = hostFromUrl(originHeader);

  // Reflect the origin ONLY when it matches our own host (never a wildcard).
  if (originHeader && originHost && host && originHost === host) {
    res.setHeader('Access-Control-Allow-Origin', originHeader);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Device-Id');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  if ((req.method || '').toUpperCase() === 'OPTIONS') {
    res.status(204).end();
    return true; // preflight handled; caller should stop
  }
  return false;
}

// Convenience: run the standard cross-origin protections at the top of an API
// handler. Returns true when the request was already terminated (preflight).
export function guardRequest(req: NextApiRequest, res: NextApiResponse): boolean {
  if (applyCors(req, res)) return true;
  assertSameOrigin(req);
  return false;
}
