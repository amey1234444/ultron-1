// Password-reset token lifecycle.
//
// A reset token is a bearer credential: whoever holds it can take over the
// account. It is therefore handled exactly like a session token and a password:
//
//  - 32 bytes from a CSPRNG, so it cannot be guessed or enumerated
//  - only the SHA-256 HASH is stored, so a database leak does not hand an
//    attacker a working reset link
//  - short lived (30 minutes) and strictly single use
//  - issuing a new one invalidates every earlier unused token for that account,
//    so a forwarded or intercepted old email stops working
//  - consuming one revokes every existing session for that user, because a
//    password reset is exactly what someone does when they believe an attacker
//    is already inside the account

import crypto from 'crypto';

import bcrypt from 'bcryptjs';

import { ensureSchema, isDbEnabled, query } from './db';
import { ApiError } from './errors';
import { findByEmail, type StoredUser } from './users';

const TOKEN_BYTES = 32;
const TTL_MINUTES = 30;
const BCRYPT_ROUNDS = 10;

/** Minimum password length. Matches what the signup flow accepts. */
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(password: string): string | null {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) return 'Password is too long.';
  // Deliberately not a composition rule (upper/lower/digit/symbol): length is a
  // better predictor of strength, and composition rules push people toward
  // predictable substitutions.
  return null;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type IssuedReset = {
  user: StoredUser;
  /** The raw token. Emailed to the user and never persisted anywhere. */
  token: string;
  expiresAt: Date;
};

/**
 * Issue a reset token for an email address.
 *
 * Returns `null` when no active account matches. The CALLER must respond
 * identically either way — see the route — or this becomes a way to discover
 * which addresses hold accounts.
 */
export async function issueResetToken(email: string): Promise<IssuedReset | null> {
  if (!isDbEnabled()) throw new ApiError(503, 'DATABASE_URL is required for password reset.');
  await ensureSchema();

  const user = await findByEmail(email.trim().toLowerCase());
  // Only an active account can be reset. A pending account has not been
  // approved yet and a disabled one was disabled deliberately; letting either
  // reset a password would be a way around that decision.
  if (!user || user.status !== 'active') return null;

  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);

  // Supersede anything outstanding for this user before issuing.
  await query(
    `UPDATE password_reset_tokens SET consumed_at = now()
     WHERE user_id = $1 AND consumed_at IS NULL`,
    [user.id],
  );
  await query(
    `INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
    [hashToken(token), user.id, expiresAt.toISOString()],
  );
  // Opportunistic cleanup, same pattern as auth_sessions.
  await query(`DELETE FROM password_reset_tokens WHERE expires_at <= now() - interval '7 days'`);

  return { user, token, expiresAt };
}

export type TokenState = 'valid' | 'expired' | 'used' | 'unknown';

/** Check a token without spending it, so the reset form can fail early. */
export async function inspectResetToken(token: string): Promise<TokenState> {
  if (!isDbEnabled()) throw new ApiError(503, 'DATABASE_URL is required for password reset.');
  if (!token) return 'unknown';
  await ensureSchema();
  const result = await query<{ expired: boolean; consumed: boolean }>(
    `SELECT (expires_at <= now()) AS expired, (consumed_at IS NOT NULL) AS consumed
     FROM password_reset_tokens WHERE token_hash = $1`,
    [hashToken(token)],
  );
  const row = result.rows[0];
  if (!row) return 'unknown';
  if (row.consumed) return 'used';
  if (row.expired) return 'expired';
  return 'valid';
}

export type ConsumeResult = { ok: true; userId: string } | { ok: false; state: TokenState };

/**
 * Spend a token and set the new password.
 *
 * The token is marked consumed in the same statement that selects it, so two
 * concurrent requests cannot both succeed with one token.
 */
export async function consumeResetToken(token: string, newPassword: string): Promise<ConsumeResult> {
  if (!isDbEnabled()) throw new ApiError(503, 'DATABASE_URL is required for password reset.');
  await ensureSchema();

  const problem = passwordProblem(newPassword);
  if (problem) throw new ApiError(400, problem);

  const claimed = await query<{ user_id: string }>(
    `UPDATE password_reset_tokens
     SET consumed_at = now()
     WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [hashToken(token)],
  );
  const userId = claimed.rows[0]?.user_id;
  if (!userId) return { ok: false, state: await inspectResetToken(token) };

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);

  // Anyone already signed in as this user is signed out. If the reset was
  // prompted by a compromise, leaving the attacker's session alive would defeat
  // the entire exercise.
  await query(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);

  return { ok: true, userId };
}

/** The link that goes in the email. */
export function resetUrl(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

export function resetEmail(name: string, url: string, expiresAt: Date) {
  const minutes = Math.max(1, Math.round((expiresAt.getTime() - Date.now()) / 60000));
  const greeting = name?.trim() ? `Hello ${name.trim()},` : 'Hello,';
  const text = [
    greeting,
    '',
    'We received a request to reset the password on your ULTRON account.',
    '',
    `Open this link to choose a new password (valid for ${minutes} minutes, single use):`,
    url,
    '',
    'If you did not request this, you can ignore this email — your password has not changed,',
    'and the link above will expire on its own.',
    '',
    'ULTRON',
  ].join('\n');

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111">
  <p>${greeting}</p>
  <p>We received a request to reset the password on your ULTRON account.</p>
  <p><a href="${url}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Choose a new password</a></p>
  <p style="color:#555;font-size:13px">This link is valid for ${minutes} minutes and can be used once.</p>
  <p style="color:#555;font-size:13px">If you did not request this you can ignore this email — your password has not changed, and the link will expire on its own.</p>
  <p style="color:#555;font-size:13px">If the button does not work, paste this into your browser:<br><span style="word-break:break-all">${url}</span></p>
</div>`;

  return { subject: 'Reset your ULTRON password', text, html };
}
