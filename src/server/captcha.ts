import crypto from 'crypto';

// Self-contained, stateless CAPTCHA. The server renders a distorted SVG of a
// random code and hands back a signed token = base64(payload).hmac where the
// payload carries the (lower-cased) answer and an expiry. On submit the client
// echoes the token plus the user's answer; we recompute the HMAC, check expiry,
// and compare answers. No third-party service, no shared server state — works on
// serverless out of the box. Bots must actually OCR the image to pass.

const TTL_MS = 5 * 60 * 1000; // token valid for 5 minutes
// Avoid ambiguous glyphs (0/O, 1/I/l).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LENGTH = 5;

function secret(): string {
  return process.env.CAPTCHA_SECRET || process.env.AUTH_SECRET || 'ultron-captcha-dev-secret';
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
}

function randomCode(): string {
  const bytes = crypto.randomBytes(LENGTH);
  let out = '';
  for (let i = 0; i < LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// Salted hash of the answer, so the token never carries the plaintext solution
// (otherwise a bot could just base64-decode it instead of reading the image).
function hashAnswer(answer: string, nonce: string): string {
  return crypto.createHmac('sha256', secret()).update(`${nonce}:${answer.trim().toLowerCase()}`).digest('base64url');
}

export type CaptchaChallenge = { token: string; svg: string };

export function createChallenge(): CaptchaChallenge {
  const code = randomCode();
  const nonce = crypto.randomBytes(9).toString('hex');
  const payloadObj = { h: hashAnswer(code, nonce), e: Date.now() + TTL_MS, n: nonce };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const token = `${payload}.${sign(payload)}`;
  return { token, svg: renderSvg(code) };
}

export function verifyCaptcha(token: unknown, answer: unknown): boolean {
  if (typeof token !== 'string' || typeof answer !== 'string') return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = sign(payload);
  if (!timingSafeEqual(mac, expected)) return false;
  try {
    const obj = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { h?: string; e?: number; n?: string };
    if (!obj || typeof obj.h !== 'string' || typeof obj.e !== 'number' || typeof obj.n !== 'string') return false;
    if (Date.now() > obj.e) return false;
    return timingSafeEqual(hashAnswer(answer, obj.n), obj.h);
  } catch {
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// --- rendering -------------------------------------------------------------

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function renderSvg(code: string): string {
  const width = 200;
  const height = 70;
  const colors = ['#C9A15C', '#58A6FF', '#3FB950', '#F2A93B', '#BC8CFF'];

  const noiseLines = Array.from({ length: 6 }, () => {
    const x1 = rand(0, width);
    const y1 = rand(0, height);
    const x2 = rand(0, width);
    const y2 = rand(0, height);
    const c = colors[Math.floor(rand(0, colors.length))];
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="1" opacity="0.5"/>`;
  }).join('');

  const dots = Array.from({ length: 40 }, () => {
    const cx = rand(0, width);
    const cy = rand(0, height);
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rand(0.5, 1.6).toFixed(1)}" fill="#8A8A8A" opacity="0.4"/>`;
  }).join('');

  const glyphs = code
    .split('')
    .map((ch, i) => {
      const x = 24 + i * 34 + rand(-4, 4);
      const y = 46 + rand(-6, 6);
      const rot = rand(-24, 24);
      const c = colors[Math.floor(rand(0, colors.length))];
      const size = rand(30, 38);
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="${c}" font-size="${size.toFixed(0)}" font-family="monospace" font-weight="bold" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})">${escapeXml(ch)}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="captcha"><rect width="${width}" height="${height}" rx="8" fill="#0E0E0E"/>${dots}${noiseLines}${glyphs}</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] as string);
}
