import type { NextApiRequest, NextApiResponse } from 'next';

import { isDbEnabled } from '../../../server/db';
import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';
import { saveMachineTemplate, type Layout } from '../../../server/workspace';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });

    if (req.method !== 'PUT') {
      res.setHeader('Allow', 'PUT');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    if (!isDbEnabled()) return res.status(200).json({ persisted: false });
    await enforceRateLimit(req, res, 'api');
    if (user.role !== 'super_admin') {
      return res.status(403).json({ error: 'You do not have permission to save machine templates.' });
    }

    const body = (req.body ?? {}) as { machineTemplate?: string; layout?: Layout };
    if (!body.machineTemplate || !body.layout || !Array.isArray(body.layout.trails) || !Array.isArray(body.layout.boxes)) {
      return res.status(400).json({ error: 'Invalid template payload.' });
    }
    const result = await saveMachineTemplate(body.machineTemplate, body.layout);
    return res.status(200).json({ layoutRevision: result.layoutRevision });
  } catch (err) {
    return sendApiError(res, err, 'api/workspace/template');
  }
}
