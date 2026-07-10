import type { NextApiRequest, NextApiResponse } from 'next';

import { enforceRateLimit } from '../../../server/rateLimit';
import { requireUser } from '../../../server/session';
import { DEFAULT_RATE_LIMITS, getRateLimits, sanitizeSettings, setRateLimits } from '../../../server/settings';
import { ApiError } from '../../../server/users';

// Super-admin-tunable rate limits. GET returns the effective limits + defaults;
// PUT overwrites them (super admin only).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await enforceRateLimit(req, res, 'api');
    if (req.method === 'GET') {
      await requireUser(req, 'super_admin');
      return res.status(200).json({ rateLimits: await getRateLimits(), defaults: DEFAULT_RATE_LIMITS });
    }
    if (req.method === 'PUT') {
      await requireUser(req, 'super_admin');
      const next = sanitizeSettings((req.body ?? {}) as unknown);
      const saved = await setRateLimits(next);
      return res.status(200).json({ rateLimits: saved, defaults: DEFAULT_RATE_LIMITS });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
