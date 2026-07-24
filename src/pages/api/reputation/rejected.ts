import type { NextApiRequest, NextApiResponse } from 'next';

import {
  deleteRejectedEmail,
  listRejectedEmails,
  overrideRejectedEmail,
} from '../../../server/emailReputation';
import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { requireUser } from '../../../server/session';

// Super-admin-only feed of emails barred by the reputation gate, including the
// complete stored API response. Actions:
//   GET               list rejected emails + active (non-overridden) count
//   POST { id }       override — clears the decision so the email can register
//   DELETE { id }     remove the rejected record
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    await enforceRateLimit(req, res, 'api');

    if (req.method === 'GET') {
      await requireUser(req, 'super_admin');
      return res.status(200).json(await listRejectedEmails());
    }
    if (req.method === 'POST') {
      await requireUser(req, 'super_admin');
      const { id } = (req.body ?? {}) as Record<string, unknown>;
      if (!id) return res.status(400).json({ error: 'id is required.' });
      await overrideRejectedEmail(String(id));
      return res.status(200).json(await listRejectedEmails());
    }
    if (req.method === 'DELETE') {
      await requireUser(req, 'super_admin');
      const { id } = (req.body ?? {}) as Record<string, unknown>;
      if (!id) return res.status(400).json({ error: 'id is required.' });
      await deleteRejectedEmail(String(id));
      return res.status(200).json(await listRejectedEmails());
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return sendApiError(res, err, 'api/reputation/rejected');
  }
}
