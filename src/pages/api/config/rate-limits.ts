import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { requireUser } from '../../../server/session';
import { DEFAULT_RATE_LIMITS, getRateLimits, sanitizeSettings, setRateLimits } from '../../../server/settings';

// Super-admin-tunable rate limits. GET returns the effective limits + defaults;
// PUT overwrites them (super admin only).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
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
    return sendApiError(res, err, 'api/config/rate-limits');
  }
}
