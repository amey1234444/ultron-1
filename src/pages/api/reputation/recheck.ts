import type { NextApiRequest, NextApiResponse } from 'next';

import { findReputation } from '../../../server/emailReputation';
import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { drainReputationQueue, enqueueReputationCheck } from '../../../server/reputationQueue';
import { guardRequest } from '../../../server/security';
import { requireUser } from '../../../server/session';
import { findById, getUserReputation } from '../../../server/users';

// Super-admin-only: manually (re-)validate an email through Abstract. Used by the
// Manage Users "Re-check" button for unchecked accounts. Enqueues the email and
// drains the rate-limited queue, prioritizing this email so the caller gets the
// fresh verdict back synchronously.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    await enforceRateLimit(req, res, 'api');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    await requireUser(req, 'super_admin');

    const { userId, email } = (req.body ?? {}) as Record<string, unknown>;
    let targetEmail = typeof email === 'string' ? email.trim() : '';
    const uid = typeof userId === 'string' ? userId : '';
    if (uid) {
      const user = await findById(uid);
      if (!user) return res.status(404).json({ error: 'User not found.' });
      targetEmail = user.email;
    }
    if (!targetEmail) return res.status(400).json({ error: 'userId or email is required.' });

    await enqueueReputationCheck(targetEmail, uid ? `manual:${uid}` : 'manual');
    const queue = await drainReputationQueue({ maxJobs: 5, maxMs: 9000, prefer: targetEmail });

    const record = await findReputation(targetEmail);
    const reputation = uid ? await getUserReputation(uid) : null;
    return res.status(200).json({ record, reputation, queue });
  } catch (err) {
    return sendApiError(res, err, 'api/reputation/recheck');
  }
}
