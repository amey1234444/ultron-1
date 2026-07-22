import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { guardRequest } from '../../../server/security';
import { clearSession } from '../../../server/session';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    await clearSession(req, res);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return sendApiError(res, err, 'api/auth/logout');
  }
}
