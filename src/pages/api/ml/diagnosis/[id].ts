import type { NextApiRequest, NextApiResponse } from 'next';

import { degradedMlBlock, latestDiagnosis, runInference } from '../../../../server/mlClient';
import { persistMlDiagnosis } from '../../../../server/mlPersistence';
import { sendApiError } from '../../../../server/errors';
import { guardRequest } from '../../../../server/security';
import { getSessionUser } from '../../../../server/session';

/**
 * The machine's ML diagnosis.
 *
 * GET  returns the latest the service holds.
 * POST submits a telemetry frame, runs the chain and persists the result.
 *
 * The response always carries an `ml` block, even when the service could not
 * be reached: the Analyzer reads it to decide what to say, and a missing block
 * would render as a blank panel where an explanation belongs. `degraded` is
 * true exactly when the findings are unavailable, and `detail` is the sentence
 * an engineer needs — "no model has been promoted" and "the service is down"
 * are different problems with different owners.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });

    const machineId = String(req.query.id ?? '');
    if (!machineId) return res.status(400).json({ error: 'Machine id is required.' });

    if (req.method === 'GET') {
      const result = await latestDiagnosis(machineId);
      if (!result.ok) {
        // 200, not 503. The absence of a learned finding is a normal state of
        // the system, and the Analyzer renders it as one. A 5xx here would
        // make an ordinary deployment look broken.
        return res.status(200).json({
          machineId,
          degraded: true,
          diagnosis: null,
          ml: degradedMlBlock(result),
          detail: result.detail,
        });
      }
      return res.status(200).json({ machineId, degraded: false, diagnosis: result.value });
    }

    if (req.method === 'POST') {
      const body =
        typeof req.body === 'string' && req.body ? (JSON.parse(req.body) as Record<string, unknown>) : req.body;
      const frame = (body as Record<string, unknown>)?.frame;
      if (!frame) return res.status(400).json({ error: 'A telemetry frame is required.' });

      const explain = Boolean((body as Record<string, unknown>)?.explain);
      const result = await runInference(frame, { explain });
      if (!result.ok) {
        return res.status(200).json({
          machineId,
          degraded: true,
          diagnosis: null,
          ml: degradedMlBlock(result),
          detail: result.detail,
        });
      }

      // Persistence must not fail the request. A prediction that was produced
      // and shown but not stored is a lineage gap worth logging; a 500 here
      // would lose the prediction as well.
      const stored = await persistMlDiagnosis(result.value).catch((error: unknown) => ({
        stored: false,
        reason: (error as Error).message,
      }));

      return res.status(200).json({
        machineId,
        degraded: false,
        diagnosis: result.value,
        persistence: stored,
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return sendApiError(res, err, 'api/ml/diagnosis/[id]');
  }
}
