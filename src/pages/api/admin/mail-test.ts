import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { isMailConfigured, sendMail, verifyMailTransport } from '../../../server/mailer';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';
import { requireUser } from '../../../server/session';
import { findByEmail } from '../../../server/users';

/**
 * Mail diagnostics. SUPER ADMIN ONLY.
 *
 * `/api/auth/forgot-password` deliberately answers identically whether it sent
 * an email, found no account, or failed to reach the mail host — that is what
 * stops it being used to discover which addresses have accounts. The cost is
 * that a genuine misconfiguration is invisible from the browser.
 *
 * This endpoint is the sanctioned way to see the truth. It is safe to report
 * real errors here precisely because it requires a super-admin session: someone
 * who already holds that can list every user anyway, so nothing is disclosed
 * that they could not otherwise obtain.
 *
 *   GET                      configuration + live SMTP handshake
 *   GET ?email=someone@x     also reports whether THAT address could receive a
 *                            reset (account exists, and is active)
 *   POST { to }              send a real test message and return the true error
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    await requireUser(req, 'super_admin');
    await enforceRateLimit(req, res, 'api');

    const env = {
      SMTP_HOST: process.env.SMTP_HOST ? 'set' : 'MISSING',
      SMTP_PORT: process.env.SMTP_PORT ?? '(default 587)',
      SMTP_SECURE: process.env.SMTP_SECURE ?? '(inferred from port)',
      SMTP_USER: process.env.SMTP_USER ? 'set' : 'MISSING',
      // Never echo the secret — only whether it is present, and under which name.
      SMTP_PASS: process.env.SMTP_PASS ? 'set' : process.env.SMTP_PASSWORD ? 'set (as SMTP_PASSWORD)' : 'MISSING',
      SMTP_FROM: process.env.SMTP_FROM ?? '(falls back to SMTP_USER)',
      APP_ORIGIN: process.env.APP_ORIGIN ?? 'MISSING — reset links fall back to the Host header',
      DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'MISSING — password reset returns 503',
    };

    if (req.method === 'GET') {
      const configured = isMailConfigured();
      const handshake = configured ? await verifyMailTransport() : null;

      // Optional: explain why a specific address would receive nothing.
      const email = typeof req.query.email === 'string' ? req.query.email.trim().toLowerCase() : '';
      let recipient: Record<string, unknown> | null = null;
      if (email) {
        const user = process.env.DATABASE_URL ? await findByEmail(email) : undefined;
        recipient = user
          ? {
              accountFound: true,
              status: user.status,
              wouldSend: user.status === 'active',
              reason:
                user.status === 'active'
                  ? 'Active account — a reset email would be sent.'
                  : `Account status is "${user.status}". Only active accounts can reset a password, so nothing is sent.`,
            }
          : {
              accountFound: false,
              wouldSend: false,
              reason: 'No account has this email address, so nothing is sent. Check for a typo or a different address on the account.',
            };
      }

      return res.status(200).json({
        env,
        configured,
        handshake: handshake === null ? 'skipped — SMTP_HOST is not set' : handshake,
        recipient,
      });
    }

    if (req.method === 'POST') {
      const { to } = (req.body ?? {}) as { to?: string };
      if (!to || !to.includes('@')) return res.status(400).json({ error: 'Provide a "to" address.' });
      const result = await sendMail({
        to,
        subject: 'BlackGATE — mail transport test',
        text: 'This is a test message from the BlackGATE mail diagnostics endpoint. If you received it, password-reset email will work.',
      });
      return res.status(200).json({ env, result });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    return sendApiError(res, err, 'api/admin/mail-test');
  }
}
