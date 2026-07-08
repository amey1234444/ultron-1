import type { NextApiRequest, NextApiResponse } from 'next';

import { getSessionUser } from '../../../server/session';
import { findById, toPublic, touchLastSeen } from '../../../server/users';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ user: null });
  // Refresh the activity heartbeat so this user shows as online, and return the
  // freshly-stamped record.
  touchLastSeen(user.id);
  const fresh = findById(user.id);
  return res.status(200).json({ user: fresh ? toPublic(fresh) : user });
}
