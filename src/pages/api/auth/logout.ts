import type { NextApiRequest, NextApiResponse } from 'next';

import { clearSession } from '../../../server/session';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  clearSession(res);
  return res.status(200).json({ ok: true });
}
