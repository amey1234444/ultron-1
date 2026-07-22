import type { NextApiRequest, NextApiResponse } from 'next';

import { requireUser } from '../../../server/session';
import { ApiError, createUser, listUsers } from '../../../server/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      // Any authenticated user can view the directory; only super admins mutate it.
      requireUser(req);
      return res.status(200).json({ users: listUsers() });
    }
    if (req.method === 'POST') {
      requireUser(req, 'super_admin');
      const { username, name, email, role, password } = (req.body ?? {}) as Record<string, string>;
      const user = await createUser({ username, name, email, role: role as never, password });
      return res.status(201).json({ user });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return handleError(res, err);
  }
}

function handleError(res: NextApiResponse, err: unknown) {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
  return res.status(500).json({ error: 'Internal server error.' });
}
