import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../../server/errors';
import { enforceRateLimit } from '../../../../server/rateLimit';
import { guardRequest } from '../../../../server/security';
import { getSessionUser } from '../../../../server/session';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    await enforceRateLimit(req, res, 'api');
    return res.status(200).json({ persisted: false, stored: 0, accepted: 0, disabled: 'measurement_history_chunks' });
  } catch (err) {
    return sendApiError(res, err, 'api/live/history/chunks');
  }
}
