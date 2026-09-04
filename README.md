# BlackGATE

Industrial HMI / asset-hierarchy console. The UI is built with React Native components
and runs on **two targets from one codebase**:

- **Expo** (iOS / Android / Expo web) — unchanged (`npm start`).
- **Next.js** (Vercel web deployment) — renders the same React Native component tree
  via `react-native-web`, adds authentication, and deploys to Vercel.

## Web app (Next.js)

```bash
npm install
npm run dev        # Next.js dev server  -> http://localhost:3000
npm run build      # production build
npm run start:next # serve the production build
npm run typecheck  # tsc against tsconfig.next.json
```

### Architecture

- `src/pages/` — Next.js Pages Router (web routes + `src/pages/api/*` auth/user APIs).
- `src/screens/` — web screens (`LoginScreen`, `ConsoleScreen`, `UsersScreen`), rendered
  client-side (`ssr: false`) since they use `react-native-web`.
- `app/`, `components/`, `lib/`, `hooks/` — the shared React Native tree, reused as-is.
- `babel.config.js` branches on the Babel caller so Metro (Expo) and Next each get the
  right preset from a single config.
- `next.config.js` aliases `react-native` → `react-native-web`, transpiles the RN/Expo
  packages, and enables `experimental.externalDir` to import the shared tree.

## Authentication & roles

Three role levels, ranked `super_admin > admin > user`:

| Role          | Capabilities                                                        |
| ------------- | ------------------------------------------------------------------- |
| `user`        | Access the console.                                                  |
| `admin`       | Access the console + view the user directory.                        |
| `super_admin` | Everything, **plus add / edit / remove any user** at `/admin/users`.|

Sessions use opaque random `httpOnly` cookies. Only a SHA-256 token hash is
stored in Supabase PostgreSQL (`auth_sessions`), so login sessions survive
deploys/restarts and can be revoked server-side. Every `/api/users*` mutation is
enforced server-side (super admin only), not just hidden in the UI.

### Account approval (new signups are gated)

Self-service signups no longer grant access. A new account is created with
status **`pending`** and receives **no session** — a super admin must approve it
at `/admin/users` before the user can sign in. Login, `/api/auth/me`, and every
session check reject any account whose status is not `active`, so a valid token
alone is not enough. Self-signup always forces the lowest (`user`) role; roles
can never be self-elevated. Accounts have three statuses:

| Status     | Meaning                                                        |
| ---------- | ------------------------------------------------------------- |
| `pending`  | Awaiting super-admin approval; cannot sign in.               |
| `active`   | Approved; normal access per role.                            |
| `disabled` | Suspended by a super admin; cannot sign in.                  |

### Bot protection & rate limiting

#### CAPTCHA (`src/server/captcha.ts`)

A self-contained, **stateless** image CAPTCHA — no third-party service, key, or
server-side session needed, so it works on serverless out of the box.

- `GET /api/captcha` returns `{ token, svg }`. The SVG is a distorted, noisy
  render of a random 5-char code (ambiguous glyphs like `0/O/1/I` excluded).
- The `token` is `base64url(payload).hmacSHA256(payload)` where the payload is
  `{ h, e, n }`:
  - `h` = `HMAC_SHA256(secret, "<nonce>:<answer>")` — a **salted hash** of the
    answer, never the plaintext. A bot cannot base64-decode the token to learn
    the answer; it must actually OCR the image.
  - `e` = expiry (**5 minutes**), `n` = random nonce.
- On signup the client echoes `captchaToken` + `captchaAnswer`. The server
  recomputes the HMAC (rejects tampering), checks expiry, and timing-safe
  compares `HMAC(secret, nonce:answer)` to `h`.
- The signing secret is `CAPTCHA_SECRET` (falls back to `AUTH_SECRET`). The
  challenge auto-rotates on any failed attempt.

#### Rate limiting (`src/server/rateLimit.ts`)

Every API route is throttled with a **sliding window**. Each request is checked
against **two windows that must both pass**:

1. **IP + device fingerprint** — the precise per-client limit.
2. **IP only**, at 10× the cap — a safety net so an attacker can't bypass (1) by
   rotating the `x-device-id` header from a single IP, while still allowing many
   real users behind one shared NAT/office IP.

- The device fingerprint = `sha256(x-device-id + user-agent)`; `x-device-id` is a
  random id the browser persists in `localStorage`. It's advisory (raises attack
  cost), never a security boundary on its own — the IP window backs it up.
- Defaults (`src/server/settings.ts`): **signup 3/hour** (hardcoded product
  requirement), **login 10 / 15 min**, **general API 300 / 60 s**. Login and API
  limits are tunable by a super admin at `/admin/users` → `GET/PUT
  /api/config/rate-limits` (persisted in `app_settings`).
- Over-limit requests get **HTTP 429** with a `Retry-After` header. A rejected
  request does **not** consume quota (all windows are counted before any is
  recorded). The limiter **fails open** if its storage backend errors, so a DB
  hiccup never locks out legitimate users.
- Backed by the `rate_events` table in Postgres (holds across serverless
  instances) or an in-memory window when no `DATABASE_URL`.

### Web security (CSRF, XSS, CORS, SQL injection, headers)

- **CSRF** — the session cookie is `httpOnly` + `SameSite=Lax`, and every
  state-changing request (`POST/PUT/PATCH/DELETE`) additionally passes a
  server-side **same-origin check** (`src/server/security.ts`): if an
  `Origin`/`Referer` is present and its host ≠ the request host, it's rejected
  with `403`. Non-browser callers (no Origin) still work.
- **CORS** — same-origin only. The API **never** emits
  `Access-Control-Allow-Origin: *`; it reflects the origin *only* when it matches
  our own host, and answers preflight `OPTIONS` accordingly. Cross-origin reads
  are blocked by the browser.
- **XSS** — React/react-native-web auto-escape all rendered text; the CAPTCHA is
  delivered as an `<img>` data-URI (never injected as raw HTML), and the SVG
  itself XML-escapes its glyphs. A strict **Content-Security-Policy**
  (`script-src 'self'` in production, `object-src 'none'`, `base-uri 'self'`,
  `frame-ancestors 'none'`) is set in `next.config.js` as defense-in-depth.
- **SQL injection** — every query uses **parameterized** `$1,$2,…` placeholders
  (`pg`); no string concatenation of user input into SQL anywhere.
- **Security headers** (all routes): `Content-Security-Policy`,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`,
  `Cross-Origin-Opener-Policy: same-origin`, and `Strict-Transport-Security`
  (production). `X-Powered-By` is disabled.
- **Passwords** are hashed with **bcrypt**; sessions are opaque, database-backed
  tokens and are rejected unless the account is still `active`.

### Seed accounts

Created on first server start (passwords overridable via env — set these in Vercel):

| Username     | Role          | Password env var        | Default          |
| ------------ | ------------- | ----------------------- | ---------------- |
| `superadmin` | super_admin   | `SUPER_ADMIN_PASSWORD`  | `superadmin123`  |
| `admin`      | admin         | `ADMIN_PASSWORD`        | `admin123`       |
| `user`       | user          | `USER_PASSWORD`         | `user123`        |

Set `AUTH_SECRET` in production to a strong random value for CAPTCHA signing.

### Database (Supabase PostgreSQL)

Production requires a Supabase PostgreSQL `DATABASE_URL`. The database stores:

- users and durable login sessions;
- projects, nested folders, machines, components, devices, and rack cards;
- machine canvas box/trail coordinates and card/channel mappings;
- app settings, collaboration revision counters, and rate-limit events.

The idempotent migration is checked in at
`supabase/migrations/20260714000000_durable_studio.sql`. The server also creates
missing tables on first use. A fresh database receives the demo workspace once;
`studio_meta.seeded` prevents later deploys from reseeding or deleting existing
data.

The client loads this shared workspace after authentication and polls lightweight
revision counters. Hierarchy edits and saved canvas layouts therefore become
visible to other authenticated users. Design/configure and actual/non-configure
views consume the same per-machine layout, including fixed-stage coordinates and
the number/configuration of rack cards.

Create a project at [Supabase](https://supabase.com), then copy **Project
Settings → Database → Connection string → URI** into Vercel's `DATABASE_URL`
environment variable. Use the transaction pooler URI for serverless deployments
and keep `sslmode=require`. See `.env.example` for the expected format.

### MQTT ingestion in the Vercel app

Production MQTT ingestion is handled by the Next.js app through
`POST /api/mqtt/ingest`. Configure EMQX with an HTTP Action/Webhook that forwards
`ultron/v1/gateways/#` messages to:

```text
https://YOUR-VERCEL-DOMAIN/api/mqtt/ingest
```

Set `MQTT_INGEST_SECRET` in Vercel and send it as the
`x-ultron-ingest-secret` header from EMQX. This replaces the standalone
`services/mqtt-ingest` worker for Vercel deployments; do not run both long-term.
The full EMQX webhook event is stored in `mqtt_messages.source_event`, while the
gateway payload is normalized into the live telemetry tables. See
`docs/vercel-mqtt-ingest.md` for the EMQX rule/action body and validation
queries.

## Deployment (Vercel)

Pushing to `main`/`master` auto-deploys via `.github/workflows/deploy-vercel.yml`.
The workflow needs these **GitHub repository secrets** (already configured for this repo):

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Set `DATABASE_URL`, `AUTH_SECRET`, and `*_PASSWORD` in the Vercel project
settings. Do not point production at an ephemeral/local database.
