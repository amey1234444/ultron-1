import type { NextApiRequest, NextApiResponse } from 'next';

import { issueSession } from '../../../server/session';
import { ApiError, createUser, findByUsername, recordLogin } from '../../../server/users';

// Public self-service sign-up. New accounts always get the lowest ('user') role
// regardless of any client-supplied value — role changes stay a super-admin-only
// action in User Management.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    const { username, name, email, password } = (req.body ?? {}) as Record<string, string>;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (findByUsername(username)) {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    const user = await createUser({ username, name: name || username, email: email || '', role: 'user', password });
    recordLogin(user.id);
    // createUser returns the PublicUser; re-issue the session from the stored record.
    const stored = findByUsername(username);
    if (stored) issueSession(res, stored);
    return res.status(201).json({ user });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
