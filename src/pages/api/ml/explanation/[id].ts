import type { NextApiRequest, NextApiResponse } from 'next';

import { explanation } from '../../../../server/mlClient';
import { sendApiError } from '../../../../server/errors';
import { guardRequest } from '../../../../server/security';
import { getSessionUser } from '../../../../server/session';

/**
 * Model contributions for one prediction.
 *
 * Fetched on demand, which is why explanations are not computed for every
 * inference: exact tree SHAP on a 1600-column vector is cheap once and
 * wasteful sixty times a minute across every fault. Opening the detail view is
 * what makes one worth computing.
 *
 * The caveat travels with the payload. These are contributions to the model's
 * output, not a causal ranking, and an engineer who reads a SHAP bar chart as
 * causality will go and work on a symptom.
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

    const predictionId = String(req.query.id ?? '');
    if (!predictionId) return res.status(400).json({ error: 'A prediction id is required.' });

    const result = await explanation(predictionId);
    if (!result.ok) {
      return res.status(200).json({ predictionId, available: false, detail: result.detail });
    }
    return res.status(200).json(result.value);
  } catch (err) {
    return sendApiError(res, err, 'api/ml/explanation/[id]');
  }
}
