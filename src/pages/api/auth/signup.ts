import type { NextApiRequest, NextApiResponse } from 'next';

import { verifyCaptcha } from '../../../server/captcha';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { ApiError, createUser, findByUsername } from '../../../server/users';

// Public self-service sign-up. New accounts:
//  - always get the lowest ('user') role regardless of any client-supplied value,
//  - are created as `pending` and DO NOT receive a session — a super admin must
//    approve them before they can sign in. This is the core fix for unauthorized
//    dashboard access.
//  - are gated by CAPTCHA and a strict rate limit (3/hour per IP+device by default).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    await enforceRateLimit(req, res, 'signup');

    const { username, name, email, password, captchaToken, captchaAnswer } = (req.body ?? {}) as Record<
      string,
      string
    >;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (!verifyCaptcha(captchaToken, captchaAnswer)) {
      return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
    }
    if (await findByUsername(username)) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    const user = await createUser({
      username,
      name: name || username,
      email: email || '',
      role: 'user',
      password,
      status: 'pending',
    });

    // Intentionally NO session is issued — the account is inactive until approved.
    return res.status(201).json({
      user,
      pending: true,
      message: 'Account created. A super admin must approve it before you can sign in.',
    });
  } catch (err) {
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
    console.error('signup error', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
