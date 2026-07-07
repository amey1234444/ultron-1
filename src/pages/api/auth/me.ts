import type { NextApiRequest, NextApiResponse } from 'next';

import { getSessionUser } from '../../../server/session';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = getSessionUser(req);
  if (!user) return res.status(401).json({ user: null });
  return res.status(200).json({ user });
}
