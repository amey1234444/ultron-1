import type { NextApiRequest, NextApiResponse } from 'next';

import { isUserStatus } from '../../../lib/roles';
import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { requireUser } from '../../../server/session';
import { createUser, listUsers } from '../../../server/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    await enforceRateLimit(req, res, 'api');
    if (req.method === 'GET') {
      // Any authenticated user can view the directory; only super admins mutate it.
      await requireUser(req);
      return res.status(200).json({ users: await listUsers() });
    }
    if (req.method === 'POST') {
      await requireUser(req, 'super_admin');
      const { username, name, email, role, password, permissions, status } = (req.body ?? {}) as Record<
        string,
        unknown
      >;
      // Super-admin-created accounts default to active unless explicitly stated.
      const requestedStatus = isUserStatus(status) ? status : 'active';
      const user = await createUser({
        username: String(username ?? ''),
        name: String(name ?? ''),
        email: String(email ?? ''),
        role: role as never,
        password: String(password ?? ''),
        permissions: Array.isArray(permissions) ? (permissions as never) : [],
        status: requestedStatus,
      });
      return res.status(201).json({ user });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return sendApiError(res, err, 'api/users');
  }
}
