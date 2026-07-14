import type { NextApiRequest, NextApiResponse } from 'next';

import { USER_PERMISSIONS, userHasPermission } from '../../../lib/roles';
import { isDbEnabled } from '../../../server/db';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';
import { saveMachineLayout, type Layout } from '../../../server/studio';

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
    if (!userHasPermission(user, USER_PERMISSIONS.SCHEMA_EDIT_DELETE)) {
      return res.status(403).json({ error: 'You do not have permission to save layouts.' });
    }

    const body = (req.body ?? {}) as { machineId?: string; layout?: Layout };
    if (!body.machineId || !body.layout || !Array.isArray(body.layout.trails) || !Array.isArray(body.layout.boxes)) {
      return res.status(400).json({ error: 'Invalid layout payload.' });
    }
    const result = await saveMachineLayout(body.machineId, body.layout);
    return res.status(200).json({ layoutRevision: result.layoutRevision });
  } catch {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
