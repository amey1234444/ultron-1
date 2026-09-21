import type { NextApiRequest, NextApiResponse } from 'next';

import { faultRiskHistory } from '../../../../server/mlPersistence';
import { prognosis } from '../../../../server/mlClient';
import { sendApiError } from '../../../../server/errors';
import { guardRequest } from '../../../../server/security';
import { getSessionUser } from '../../../../server/session';

/**
 * Fault risk per horizon, plus its recent trend.
 *
 * A separate route from the diagnosis on purpose. The Analyzer renders the two
 * in different places with different visual language, and the separation
 * starts at the API so nothing downstream can conflate a predictive risk with
 * a present alarm.
 *
 * The response always carries `currentCondition` alongside the risks, because
 * "87% risk in fifteen minutes" and "no approved limit has been reached" are
 * both true at once and showing either alone misleads.
 */
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

    const machineId = String(req.query.id ?? '');
    if (!machineId) return res.status(400).json({ error: 'Machine id is required.' });

    const result = await prognosis(machineId);
    if (!result.ok) {
      return res.status(200).json({
        machineId,
        degraded: true,
        prognosis: [],
        detail: result.detail,
      });
    }

    type PrognosisEntry = Record<string, unknown> & {
      fault_id?: string;
      faultId?: string;
      horizons?: { horizon_minutes: number }[];
    };
    const payload = result.value as Record<string, unknown> & { prognosis?: PrognosisEntry[] };

    // Attach the stored trend for the dominant horizon of each fault, so the
    // chart has something to draw. History comes from Postgres rather than the
    // service, which holds only what is in memory since its last restart.
    const entries = Array.isArray(payload.prognosis) ? payload.prognosis : [];
    const withHistory = await Promise.all(
      entries.map(async (entry) => {
        const faultId = String(entry.fault_id ?? entry.faultId ?? '');
        const horizons = Array.isArray(entry.horizons) ? entry.horizons : [];
        const dominant = horizons.reduce<{ horizon_minutes: number } | null>(
          (best, candidate) => (best === null || candidate.horizon_minutes > best.horizon_minutes ? candidate : best),
          null,
        );
        if (!faultId || !dominant) return { ...(entry as Record<string, unknown>), history: [] };
        const history = await faultRiskHistory(machineId, faultId, dominant.horizon_minutes).catch(
          () => [],
        );
        return { ...(entry as Record<string, unknown>), history };
      }),
    );

    return res.status(200).json({ ...payload, degraded: false, prognosis: withHistory });
  } catch (err) {
    return sendApiError(res, err, 'api/ml/prognosis/[id]');
  }
}
