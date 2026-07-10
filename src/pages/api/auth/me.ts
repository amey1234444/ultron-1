import type { NextApiRequest, NextApiResponse } from 'next';

import { getSessionUser } from '../../../server/session';
import { findById, toPublic, touchLastSeen } from '../../../server/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ user: null });
  // Refresh the activity heartbeat so this user shows as online, and return the
  // freshly-stamped record.
  await touchLastSeen(user.id);
  const fresh = await findById(user.id);
  return res.status(200).json({ user: fresh ? toPublic(fresh) : user });
}
