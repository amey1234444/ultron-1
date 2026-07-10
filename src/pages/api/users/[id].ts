import type { NextApiRequest, NextApiResponse } from 'next';

import { isUserStatus } from '../../../lib/roles';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { requireUser } from '../../../server/session';
import { ApiError, deleteUser, updateUser } from '../../../server/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  const userId = Array.isArray(id) ? id[0] : id;

  try {
    if (guardRequest(req, res)) return;
    if (!userId) return res.status(400).json({ error: 'Missing user id.' });
    await enforceRateLimit(req, res, 'api');
    if (req.method === 'PATCH') {
      await requireUser(req, 'super_admin');
      const { name, email, role, password, permissions, status } = (req.body ?? {}) as Record<string, unknown>;
      const user = await updateUser(userId, {
        name: name === undefined ? undefined : String(name),
        email: email === undefined ? undefined : String(email),
        role: role as never,
        status: status === undefined ? undefined : isUserStatus(status) ? status : (undefined as never),
        password: password === undefined ? undefined : String(password),
        permissions: Array.isArray(permissions) ? (permissions as never) : undefined,
      });
      return res.status(200).json({ user });
    }
    if (req.method === 'DELETE') {
      const actor = await requireUser(req, 'super_admin');
      if (actor.id === userId) {
        return res.status(400).json({ error: 'You cannot delete your own account.' });
      }
      await deleteUser(userId);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'PATCH, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
