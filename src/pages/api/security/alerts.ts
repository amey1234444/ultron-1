import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { acknowledgeAllSecurityAlerts, listSecurityAlerts } from '../../../server/securityAlerts';
import { requireUser } from '../../../server/session';

// Super-admin-only security alarms feed. GET lists recent alarms + the
// outstanding (unacknowledged) count; POST marks them all as reviewed.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    await enforceRateLimit(req, res, 'api');
    if (req.method === 'GET') {
      await requireUser(req, 'super_admin');
      return res.status(200).json(await listSecurityAlerts());
    }
    if (req.method === 'POST') {
      await requireUser(req, 'super_admin');
      await acknowledgeAllSecurityAlerts();
      return res.status(200).json(await listSecurityAlerts());
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return sendApiError(res, err, 'api/security/alerts');
  }
}
