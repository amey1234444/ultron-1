import type { NextApiRequest, NextApiResponse } from 'next';

import { isDbEnabled } from '../../../server/db';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';
import { getLiveState } from '../../../server/telemetry';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    await enforceRateLimit(req, res, 'api');
    if (!isDbEnabled()) return res.status(200).json({ persisted: false, gateways: [], racks: [], slots: [], measurements: [] });
    const state = await getLiveState();
    return res.status(200).json({ persisted: true, ...state });
  } catch {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
