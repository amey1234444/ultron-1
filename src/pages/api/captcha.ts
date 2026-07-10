import type { NextApiRequest, NextApiResponse } from 'next';

import { createChallenge } from '../../server/captcha';
import { enforceRateLimit } from '../../server/rateLimit';
import { ApiError } from '../../server/users';

// Issues a fresh CAPTCHA challenge (signed token + SVG image) for the signup form.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  try {
    await enforceRateLimit(req, res, 'api');
    const challenge = createChallenge();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(challenge);
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
