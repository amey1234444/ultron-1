import type { NextApiRequest, NextApiResponse } from 'next';

import { isDbEnabled } from '../../../server/db';
import { sendApiError } from '../../../server/errors';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';
import { getLiveState } from '../../../server/telemetry';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    if (!isDbEnabled()) return res.status(200).json({ persisted: false, gateways: [], racks: [], slots: [], measurements: [], alerts: [] });
    const state = await getLiveState({ includeConflictDeviceDetails: user.role === 'super_admin' });
    return res.status(200).json({ persisted: true, ...state });
  } catch (err) {
    return sendApiError(res, err, 'api/live/state');
  }
}
