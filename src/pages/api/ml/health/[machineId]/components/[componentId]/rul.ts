import type { NextApiRequest, NextApiResponse } from 'next';

import { componentRul } from '../../../../../../../server/rul';
import { sendApiError } from '../../../../../../../server/errors';
import { guardRequest } from '../../../../../../../server/security';
import { getSessionUser } from '../../../../../../../server/session';

/**
 * Component health index and remaining useful life.
 *
 * Scoped to the caller's own workspace, from their session. A machine id is
 * guessable and a health history says how a plant is running, so the
 * workspace is never taken from the request.
 *
 * Answers 200 with a status inside the payload wherever it can — the contract
 * has `INSUFFICIENT_HISTORY`, `NOT_DEGRADING` and `THRESHOLD_NOT_CONFIGURED`
 * precisely so that "no number, and here is why" is a rendered answer rather
 * than an error the panel has to invent wording for. An HTTP error is kept
 * for the cases where there is nothing to say anything about: no such
 * machine, no mapping, no database.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed.' });
    }

    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });

    const machineId = String(req.query.machineId ?? '');
    const componentId = String(req.query.componentId ?? '');
    if (!machineId || !componentId) {
      return res.status(400).json({ error: 'A machine id and a component id are required.' });
    }

    const result = await componentRul(user.workspaceId, machineId, componentId);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    return res.status(200).json(result.payload);
  } catch (err) {
    return sendApiError(res, err, 'api/ml/health/components/rul');
  }
}
