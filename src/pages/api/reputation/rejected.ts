import type { NextApiRequest, NextApiResponse } from 'next';

import {
  deleteReputation,
  listReputationRecords,
  overrideReputation,
} from '../../../server/emailReputation';
import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { requireUser } from '../../../server/session';

// Super-admin-only feed of EVERY email reputation record — acceptable, rejected,
// unknown and overridden alike — including the complete stored API response.
//   GET               list all records + `barred` (active rejection) count
//   POST { id }       override — clears a rejection so the email can register
//   DELETE { id }     remove the record
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    await enforceRateLimit(req, res, 'api');

    if (req.method === 'GET') {
      await requireUser(req, 'super_admin');
      return res.status(200).json(await listReputationRecords());
    }
    if (req.method === 'POST') {
      await requireUser(req, 'super_admin');
      const { id } = (req.body ?? {}) as Record<string, unknown>;
      if (!id) return res.status(400).json({ error: 'id is required.' });
      await overrideReputation(String(id));
      return res.status(200).json(await listReputationRecords());
    }
    if (req.method === 'DELETE') {
      await requireUser(req, 'super_admin');
      const { id } = (req.body ?? {}) as Record<string, unknown>;
      if (!id) return res.status(400).json({ error: 'id is required.' });
      await deleteReputation(String(id));
      return res.status(200).json(await listReputationRecords());
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return sendApiError(res, err, 'api/reputation/rejected');
  }
}
