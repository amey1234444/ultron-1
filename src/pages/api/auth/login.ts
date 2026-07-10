import type { NextApiRequest, NextApiResponse } from 'next';

import { enforceRateLimit } from '../../../server/rateLimit';
import { issueSession } from '../../../server/session';
import { ApiError, recordLogin, toPublic, verifyCredentials } from '../../../server/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    await enforceRateLimit(req, res, 'login');

    const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    const user = await verifyCredentials(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    // Only approved, active accounts may sign in.
    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Your account is awaiting super-admin approval.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Your account has been disabled. Contact an administrator.' });
    }
    await recordLogin(user.id);
    issueSession(res, user);
    return res.status(200).json({ user: toPublic(user) });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
