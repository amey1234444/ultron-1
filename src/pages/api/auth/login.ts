import type { NextApiRequest, NextApiResponse } from 'next';

import { issueSession } from '../../../server/session';
import { recordLogin, toPublic, verifyCredentials } from '../../../server/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const { username, password } = (req.body ?? {}) as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const user = await verifyCredentials(username, password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  recordLogin(user.id);
  issueSession(res, user);
  return res.status(200).json({ user: toPublic(user) });
}
