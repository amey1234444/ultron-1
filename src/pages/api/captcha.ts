import type { NextApiRequest, NextApiResponse } from 'next';

import { createChallenge } from '../../server/captcha';
import { sendApiError } from '../../server/errors';
import { enforceRateLimit } from '../../server/rateLimit';
import { guardRequest } from '../../server/security';

// Issues a fresh CAPTCHA challenge (signed token + SVG image) for the signup form.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    await enforceRateLimit(req, res, 'api');
    const challenge = createChallenge();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(challenge);
  } catch (err) {
    return sendApiError(res, err, 'api/captcha');
  }
}
