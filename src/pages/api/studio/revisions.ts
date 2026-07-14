import type { NextApiRequest, NextApiResponse } from 'next';

import { isDbEnabled } from '../../../server/db';
import { guardRequest } from '../../../server/security';
import { getSessionUser } from '../../../server/session';
import { getRevisions } from '../../../server/studio';

// Cheap poll target: clients hit this on an interval and only refetch the full
// /studio/state when a revision changed (someone else edited the workspace).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated.' });
    if (!isDbEnabled()) return res.status(200).json({ persisted: false });
    const revisions = await getRevisions();
    return res.status(200).json({ persisted: true, ...revisions });
  } catch {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
