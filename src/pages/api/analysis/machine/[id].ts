import type { NextApiRequest, NextApiResponse } from 'next';

import { getAnalysisUiBundle, runMachineAnalysis } from '../../../../server/analysis';
import { isDbEnabled } from '../../../../server/db';
import { sendApiError } from '../../../../server/errors';
import { guardRequest } from '../../../../server/security';
import { getSessionUser } from '../../../../server/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (!isDbEnabled()) return res.status(503).json({ error: 'DATABASE_URL is required for durable analysis.' });
    const machineId = String(req.query.id ?? '');
    if (!machineId) return res.status(400).json({ error: 'Machine id is required.' });

    if (req.method === 'GET') {
      const bundle = await getAnalysisUiBundle(machineId);
      return res.status(200).json(bundle);
    }
    if (req.method === 'POST') {
      const analysis = await runMachineAnalysis(machineId);
      return res.status(200).json({ analysis });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return sendApiError(res, err, 'api/analysis/machine/[id]');
  }
}
