import type { NextApiRequest, NextApiResponse } from 'next';

import { USER_PERMISSIONS, userHasPermission } from '../../../lib/roles';
import { isDbEnabled } from '../../../server/db';
import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';
import { getWorkspace, replaceHierarchy, type HierarchyInput } from '../../../server/studio';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (!isDbEnabled()) return res.status(200).json({ persisted: false });

    if (req.method === 'GET') {
      await enforceRateLimit(req, res, 'api');
      const workspace = await getWorkspace();
      return res.status(200).json({ persisted: true, workspace });
    }

    if (req.method === 'PUT') {
      await enforceRateLimit(req, res, 'api');
      // Writes to the shared hierarchy require schema edit permission — the same
      // capability that unlocks "Configure" mode in the UI.
      if (!userHasPermission(user, USER_PERMISSIONS.SCHEMA_EDIT_DELETE)) {
        return res.status(403).json({ error: 'You do not have permission to edit the workspace.' });
      }
      const body = (req.body ?? {}) as { data?: HierarchyInput; baseRevision?: number };
      const data = body.data;
      if (!data || !Array.isArray(data.projects) || !Array.isArray(data.folders) || !Array.isArray(data.machines) || !Array.isArray(data.devices) || !Array.isArray(data.cards)) {
        return res.status(400).json({ error: 'Invalid workspace payload.' });
      }
      const result = await replaceHierarchy(data, body.baseRevision);
      if ('conflict' in result) {
        return res.status(409).json({ error: 'Workspace changed since last load.', hierRevision: result.hierRevision });
      }
      return res.status(200).json({ hierRevision: result.hierRevision });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return sendApiError(res, err, 'api/studio/state');
  }
}
