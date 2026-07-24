import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { drainReputationQueue } from '../../../server/reputationQueue';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';

function headerValue(req: NextApiRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

// Drains the reputation queue at <= 1 request/second. Intended to be triggered
// either by a super admin (session) or a scheduler (Vercel Cron / external),
// authenticating with `Authorization: Bearer $CRON_SECRET`. Safe to call often:
// the single-flight advisory lock means overlapping calls are no-ops.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const secret = process.env.CRON_SECRET;
    const authorized =
      (secret && headerValue(req, 'authorization') === `Bearer ${secret}`) ||
      (await getSessionUser(req))?.role === 'super_admin';
    if (!authorized) return res.status(401).json({ error: 'Unauthorized.' });

    const result = await drainReputationQueue();
    return res.status(200).json(result);
  } catch (err) {
    return sendApiError(res, err, 'api/reputation/process');
  }
}
