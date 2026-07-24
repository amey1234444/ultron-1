import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { requireUser } from '../../../server/session';
import { getUserReputation } from '../../../server/users';

// Super-admin-only: the complete stored reputation record (incl. the raw API
// response) for a single user. Kept off the general /api/users directory read
// because the raw response can contain breach / risk details.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    await enforceRateLimit(req, res, 'api');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    await requireUser(req, 'super_admin');
    const { id } = req.query;
    const userId = Array.isArray(id) ? id[0] : id;
    if (!userId) return res.status(400).json({ error: 'id is required.' });
    const reputation = await getUserReputation(userId);
    if (!reputation) return res.status(404).json({ error: 'User not found.' });
    return res.status(200).json({ reputation });
  } catch (err) {
    return sendApiError(res, err, 'api/reputation/user');
  }
}
