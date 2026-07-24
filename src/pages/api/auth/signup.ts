import bcrypt from 'bcryptjs';
import type { NextApiRequest, NextApiResponse } from 'next';

import type { PublicUser } from '../../../lib/roles';
import { verifyCaptcha } from '../../../server/captcha';
import { ApiError, sendApiError } from '../../../server/errors';
import { enforceRateLimit } from '../../../server/rateLimit';
import {
  addRejectedEmail,
  checkEmailReputation,
  findRejectedEmail,
} from '../../../server/emailReputation';
import { clientIp, deviceFingerprint } from '../../../server/request';
import { guardRequest } from '../../../server/security';
import { recordSecurityAlert } from '../../../server/securityAlerts';
import { createUser, findByEmail, findByUsername, type UserReputation } from '../../../server/users';

// Non-revealing response for any state that would confirm whether an
// identifier is already taken (username or email). Prevents account
// enumeration while still failing the request.
const GENERIC_CONFLICT = 'Unable to create account. Please verify the provided information.';

// Matches the cost factor used by createUser (server/users.ts) so the
// conflict path spends the same time as the account-creation path.
const BCRYPT_ROUNDS = 10;

// Shown when an email is barred by the reputation gate (either a cached prior
// rejection or a fresh not-acceptable verdict). Deliberately non-specific.
const REPUTATION_REJECTED = 'This email address is not eligible for registration.';

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
    // Always run BOTH lookups (never short-circuit) so the amount of DB work is
    // identical whether or not the username exists — no timing side-channel.
    const usernameExists = Boolean(await findByUsername(username));
    const emailExists = Boolean(await findByEmail(email));
    if (usernameExists || emailExists) {
      if (emailExists) {
        // Repeated attempts to register an already-known email are a signal of
        // account probing / mass-signup abuse — surface it to super admins.
        await recordSecurityAlert({
          kind: 'duplicate_email',
          email,
          ip: clientIp(req),
          device: deviceFingerprint(req),
          detail: 'Signup attempted with an email that is already registered.',
        });
      }
      // Spend the same bcrypt cost the account-creation path would, so
      // "already exists" and "created" responses take comparable time. Combined
      // with the identical status (409 handled below vs 201) and message, this
      // removes username/email enumeration via timing.
      await bcrypt.hash(password, BCRYPT_ROUNDS);
      return res.status(409).json({ error: GENERIC_CONFLICT });
    }

    // Email reputation gate. Runs only after the email is confirmed unique.
    //  1. If it's in the rejected-reputation cache and NOT overridden, reject
    //     immediately WITHOUT calling the paid API (cost + latency saving).
    //  2. An overridden cache entry means a super admin cleared it: skip the API
    //     and let signup proceed, carrying the stored response for the record.
    //  3. Otherwise call the API; a not-acceptable verdict rejects the signup and
    //     is cached; acceptable / unknown (provider unavailable) proceeds.
    let reputation: UserReputation | undefined;
    const cached = await findRejectedEmail(email);
    if (cached && !cached.overridden) {
      return res.status(403).json({ error: REPUTATION_REJECTED });
    }
    if (cached && cached.overridden) {
      reputation = {
        status: 'overridden',
        score: null,
        checkedAt: new Date().toISOString(),
        data: cached.data,
      };
    } else {
      const result = await checkEmailReputation(email);
      if (result.status === 'not_acceptable') {
        await addRejectedEmail(email, result.reasons, result.data);
        return res.status(403).json({ error: REPUTATION_REJECTED });
      }
      reputation = {
        status: result.status,
        score: result.score,
        checkedAt: result.checkedAt,
        data: result.data,
      };
    }

    // createUser re-validates and enforces uniqueness atomically (incl. the
    // concurrent-request race), so it remains the authoritative gate.
    let user: PublicUser;
    try {
      user = await createUser({
        username,
        name: name || username,
        email,
        role: 'user',
        password,
        status: 'pending',
        reputation,
      });
    } catch (err) {
      // Collapse the atomic-uniqueness 409 into the same non-revealing message.
      if (err instanceof ApiError && err.status === 409) {
        return res.status(409).json({ error: GENERIC_CONFLICT });
      }
      throw err;
    }

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
