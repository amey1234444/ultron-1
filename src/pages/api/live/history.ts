import type { NextApiRequest, NextApiResponse } from 'next';

import { isDbEnabled } from '../../../server/db';
import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';
import { getMeasurementHistory } from '../../../server/telemetry';

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
    if (!isDbEnabled()) return res.status(200).json({ persisted: false, points: [] });

    const gatewayId = String(req.query.gatewayId ?? '');
    const rackId = String(req.query.rackId ?? '');
    const slotId = Number(req.query.slotId);
    const channelId = Number(req.query.channelId);
    const limit = Math.min(Math.max(Number(req.query.limit) || 120, 1), 1000);
    if (!gatewayId || !rackId || !Number.isInteger(slotId) || !Number.isInteger(channelId)) {
      return res.status(400).json({ error: 'gatewayId, rackId, slotId, and channelId are required.' });
    }

    const points = await getMeasurementHistory(gatewayId, rackId, slotId, channelId, limit);
    return res.status(200).json({ persisted: true, points });
  } catch (err) {
    return sendApiError(res, err, 'api/live/history');
  }
}
