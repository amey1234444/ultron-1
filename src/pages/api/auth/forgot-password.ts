import type { NextApiRequest, NextApiResponse } from 'next';

import { sendApiError } from '../../../server/errors';
import { isMailConfigured, sendMail } from '../../../server/mailer';
import { issueResetToken, resetEmail, resetUrl } from '../../../server/passwordReset';
import { enforceRateLimit } from '../../../server/rateLimit';
import { guardRequest } from '../../../server/security';

/**
 * Start a password reset.
 *
 * The response is IDENTICAL whether or not an account exists for the address.
 * Anything else — a different status, a different message, a different shape —
 * turns this endpoint into a way to test which email addresses hold accounts,
 * which is the classic mistake in this flow.
 *
 * Rate limited on the `login` bucket: without it this is a free outbound-email
 * cannon pointed at any address an attacker chooses.
 */

const NEUTRAL_RESPONSE = {
  ok: true,
  message: 'If an account exists for that address, a reset link is on its way. The link expires in 30 minutes.',
};

function originFor(req: NextApiRequest): string {
  const configured = (process.env.APP_ORIGIN ?? '').trim();
  if (configured) return configured;
  // Fall back to the request's own origin. `host` is attacker-controllable, so
  // a configured APP_ORIGIN is strongly preferred in production — a spoofed Host
  // header would otherwise put an attacker's domain in the reset link.
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || 'https';
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host || '';
  return host ? `${proto}://${host}` : '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (guardRequest(req, res)) return;
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    await enforceRateLimit(req, res, 'login');

    const { email } = (req.body ?? {}) as { email?: string };
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Enter the email address on your account.' });
    }

    const issued = await issueResetToken(email);

    // No account: stop here, but return the same body as the success path.
    if (!issued) return res.status(200).json(NEUTRAL_RESPONSE);

    const origin = originFor(req);
    if (!origin) {
      console.error('[forgot-password] cannot build a reset link: set APP_ORIGIN');
      return res.status(200).json(NEUTRAL_RESPONSE);
    }

    const url = resetUrl(origin, issued.token);
    const { subject, text, html } = resetEmail(issued.user.name, url, issued.expiresAt);
    const result = await sendMail({ to: issued.user.email, subject, text, html });

    if (!result.delivered) {
      // Logged, never surfaced: telling the browser the send failed would
      // confirm the account exists. An operator finds this in the logs.
      console.error('[forgot-password] reset email not delivered', {
        reason: result.reason,
        detail: result.detail,
        configured: isMailConfigured(),
      });
      // Outside production, put the link in the log so the flow is testable
      // without an SMTP host. Never do this in production — it would write a
      // live account-takeover credential into the log stream.
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[forgot-password] DEV ONLY reset link for ${issued.user.email}: ${url}`);
      }
    }

    return res.status(200).json(NEUTRAL_RESPONSE);
  } catch (err) {
    return sendApiError(res, err, 'api/auth/forgot-password');
  }
}
