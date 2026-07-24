import type { NextApiRequest, NextApiResponse } from 'next';

import { verifyCaptcha } from '../../../server/captcha';
import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { createUser, findByEmail, findByUsername } from '../../../server/users';

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
    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Username, email, and password are required.' });
    }
    if (!verifyCaptcha(captchaToken, captchaAnswer)) {
      return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
    }
    if (await findByUsername(username)) {
      return res.status(409).json({ error: 'Username already exists.' });
    }
    if (await findByEmail(email)) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // createUser re-validates and enforces uniqueness atomically (incl. the
    // concurrent-request race), so it remains the authoritative gate.
    const user = await createUser({
      username,
      name: name || username,
      email,
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
    return sendApiError(res, err, 'api/auth/signup');
  }
}
