import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { consumeResetToken, inspectResetToken, passwordProblem } from '../../../server/passwordReset';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';

/**
 * GET  — report whether a token is still usable, so the form can show a clear
 *        message instead of letting someone type a new password into a dead link.
 * POST — spend the token and set the new password.
 *
 * Unlike the request endpoint, distinguishing token states here leaks nothing:
 * the caller already holds a 256-bit token, so "expired" versus "already used"
 * tells them only about a credential they possess.
 *
 * Rate limited on both verbs — the token space is far too large to brute force,
 * but an unlimited endpoint is still free CPU for bcrypt work.
 */

const STATE_MESSAGE: Record<string, string> = {
  expired: 'This reset link has expired. Request a new one.',
  used: 'This reset link has already been used. Request a new one.',
  unknown: 'This reset link is not valid. Request a new one.',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    if (req.method === 'GET') {
      await enforceRateLimit(req, res, 'api');
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      const state = await inspectResetToken(token);
      return res.status(200).json({ state, message: state === 'valid' ? null : STATE_MESSAGE[state] });
    }

    if (req.method === 'POST') {
      await enforceRateLimit(req, res, 'login');
      const { token, password } = (req.body ?? {}) as { token?: string; password?: string };
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'This reset link is not valid. Request a new one.' });
      }
      const problem = passwordProblem(password ?? '');
      if (problem) return res.status(400).json({ error: problem });

      const result = await consumeResetToken(token, password as string);
      if (!result.ok) {
        return res.status(400).json({ error: STATE_MESSAGE[result.state] ?? STATE_MESSAGE.unknown, state: result.state });
      }

      // Deliberately NOT signing the user in here. Completing a reset should
      // send them back to the login screen to prove the new password works —
      // and it keeps this endpoint from being able to mint a session.
      return res.status(200).json({
        ok: true,
        message: 'Your password has been changed and every existing session was signed out. Sign in with the new password.',
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return sendApiError(res, err, 'api/auth/reset-password');
  }
}
