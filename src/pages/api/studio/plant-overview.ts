import type { NextApiRequest, NextApiResponse } from 'next';

import { normalizePlantOverview } from '../../../../lib/plantOverview';
import { sendApiError } from '../../../server/errors';
import { getPlantOverview, savePlantOverview } from '../../../server/plantOverview';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });

    if (req.method === 'GET') {
      return res.status(200).json({ config: await getPlantOverview() });
    }

    if (req.method === 'PUT') {
      await enforceRateLimit(req, res, 'api');
      // The plant overview is a single shared layout, so only super admins may
      // change what every other user sees.
      if (user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Only super admins can edit the plant overview.' });
      }
      const body = (req.body ?? {}) as { config?: unknown };
      if (!body.config || typeof body.config !== 'object') {
        return res.status(400).json({ error: 'Invalid plant overview payload.' });
      }
      const saved = await savePlantOverview(normalizePlantOverview(body.config), user.id);
      return res.status(200).json({ config: saved });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return sendApiError(res, err, 'api/studio/plant-overview');
  }
}
