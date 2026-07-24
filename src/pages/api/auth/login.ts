import type { NextApiRequest, NextApiResponse } from 'next';

import { verifyCaptcha } from '../../../server/captcha';
import { sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { issueSession } from '../../../server/session';
import { recordLogin, toPublic, verifyCredentials } from '../../../server/users';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    await enforceRateLimit(req, res, 'login');

    const { username, password, captchaToken, captchaAnswer } = (req.body ?? {}) as {
      username?: string;
      password?: string;
      captchaToken?: string;
      captchaAnswer?: string;
    };
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    if (!verifyCaptcha(captchaToken, captchaAnswer)) {
      return res.status(400).json({ error: 'CAPTCHA verification failed. Please try again.' });
    }
    const user = await verifyCredentials(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    // Only approved, active accounts may sign in.
    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Your account is awaiting super-admin approval.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Your account has been disabled. Contact an administrator.' });
    }
    await recordLogin(user.id);
    await issueSession(res, user);
    return res.status(200).json({ user: toPublic(user) });
  } catch (err) {
    return sendApiError(res, err, 'api/auth/login');
  }
}
