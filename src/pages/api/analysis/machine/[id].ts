import type { NextApiRequest, NextApiResponse } from 'next';

import { OverviewAnalysisError, parseOverviewAnalysis } from '../../../../../lib/analysis/overviewSnapshot';
import { getAnalysisUiBundle, getOverviewHistory, persistOverviewAnalysis, runMachineAnalysis } from '../../../../server/analysis';
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
    // The Overview tab calculates the analysis in the browser from the mapped
    // live signals and posts it here to be saved. Without a body the server
    // still recomputes from durable state (cron/back-office callers).
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' && req.body ? (JSON.parse(req.body) as unknown) : req.body;
      const isClientAnalysis =
        typeof body === 'object' && body !== null && 'deepAnalysis' in (body as Record<string, unknown>);
      if (!isClientAnalysis) {
        const analysis = await runMachineAnalysis(machineId);
        return res.status(200).json({ analysis });
      }
      try {
        const input = parseOverviewAnalysis(body);
        const saved = await persistOverviewAnalysis(machineId, input);
        const overview = await getOverviewHistory(machineId);
        return res.status(200).json({ ...saved, overview });
      } catch (err) {
        if (err instanceof OverviewAnalysisError || err instanceof SyntaxError) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return sendApiError(res, err, 'api/analysis/machine/[id]');
  }
}
