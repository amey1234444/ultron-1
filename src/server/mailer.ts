// Outbound email over SMTP.
//
// Server-only. Nothing here may be imported from a client bundle: it reads SMTP
// credentials from the environment and opens a socket to the mail host.
//
// Configuration (see .env.example):
//   SMTP_HOST      required to send at all
//   SMTP_PORT      587 (STARTTLS, default) or 465 (implicit TLS)
//   SMTP_SECURE    'true' for implicit TLS on 465; inferred from the port otherwise
//   SMTP_USER      omit both credentials for an unauthenticated relay
//   SMTP_PASS      SMTP_PASSWORD is accepted as a fallback name
//   SMTP_FROM      e.g. "ULTRON <no-reply@example.com>"
//
// Local development note: antivirus products that scan mail (Avast, ESET,
// Kaspersky) intercept the TLS connection and re-sign it with their own root,
// which Node rejects as UNABLE_TO_VERIFY_LEAF_SIGNATURE. That is a machine
// problem, not a configuration one — turn the mail shield off for local testing.
// Certificate verification is deliberately never disabled here.
//
// When SMTP_HOST is absent the transport is DISABLED rather than faked. Callers
// are told the message was not sent, so a password-reset flow can decide for
// itself what to do about it — silently swallowing a failed send would leave a
// user waiting for an email that is never coming.

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult =
  | { delivered: true }
  | { delivered: false; reason: 'not_configured' | 'send_failed'; detail?: string };

let cached: Transporter | null = null;
let cachedKey = '';

function config() {
  const host = (process.env.SMTP_HOST ?? '').trim();
  const port = Number.parseInt((process.env.SMTP_PORT ?? '587').trim(), 10) || 587;
  const user = (process.env.SMTP_USER ?? '').trim();
  // SMTP_PASSWORD is accepted as a fallback name — it is the spelling most
  // hosting dashboards use, and silently authenticating with an empty password
  // because of a one-word difference is a miserable thing to debug.
  const pass = process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD ?? '';
  const secureRaw = (process.env.SMTP_SECURE ?? '').trim().toLowerCase();
  // Port 465 is implicit TLS; 587 and 25 start plaintext and upgrade via STARTTLS.
  const secure = secureRaw ? secureRaw === 'true' || secureRaw === '1' : port === 465;
  const from = (process.env.SMTP_FROM ?? '').trim() || (user ? user : 'no-reply@localhost');
  return { host, port, user, pass, secure, from };
}

export function isMailConfigured(): boolean {
  return config().host.length > 0;
}

function transport(): Transporter | null {
  const { host, port, user, pass, secure } = config();
  if (!host) return null;
  const key = `${host}|${port}|${secure}|${user}`;
  if (cached && cachedKey === key) return cached;
  cached = nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user ? { auth: { user, pass } } : {}),
    // A password reset is interactive: the user is waiting on the response, so
    // a hung mail host must fail fast rather than block the request until the
    // platform's own timeout kills it.
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
  cachedKey = key;
  return cached;
}

/**
 * Send one message.
 *
 * Never throws — the result says what happened. Callers in an authentication
 * flow must not let a mail failure change the HTTP response they give the
 * browser, or the difference becomes an account-enumeration oracle.
 */
export async function sendMail(message: MailMessage): Promise<MailResult> {
  const mailer = transport();
  if (!mailer) return { delivered: false, reason: 'not_configured' };
  try {
    await mailer.sendMail({
      from: config().from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    });
    return { delivered: true };
  } catch (err) {
    // Logged server-side only. The address is included because an operator
    // debugging a bounce needs it; the body and token never are.
    console.error('[mailer] send failed', { to: message.to, subject: message.subject, err });
    return { delivered: false, reason: 'send_failed', detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Verify the SMTP connection — for a health check or a settings screen. */
export async function verifyMailTransport(): Promise<MailResult> {
  const mailer = transport();
  if (!mailer) return { delivered: false, reason: 'not_configured' };
  try {
    await mailer.verify();
    return { delivered: true };
  } catch (err) {
    return { delivered: false, reason: 'send_failed', detail: err instanceof Error ? err.message : String(err) };
  }
}
