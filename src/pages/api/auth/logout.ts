import type { NextApiRequest, NextApiResponse } from 'next';

import { guardRequest } from '../../../server/security';
import { clearSession } from '../../../server/session';
import { ApiError } from '../../../server/users';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    clearSession(res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
