# ULTRON

Industrial HMI / asset-hierarchy studio. The UI is built with React Native components
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
- `src/screens/` — web screens (`LoginScreen`, `StudioScreen`, `UsersScreen`), rendered
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
| `user`        | Access the studio.                                                  |
| `admin`       | Access the studio + view the user directory.                        |
| `super_admin` | Everything, **plus add / edit / remove any user** at `/admin/users`.|

Sessions are JWT cookies (`httpOnly`). Every `/api/users*` mutation is enforced
server-side (super admin only), not just hidden in the UI.

### Account approval (new signups are gated)

Self-service signups no longer grant access. A new account is created with
status **`pending`** and receives **no session** — a super admin must approve it
at `/admin/users` before the user can sign in. Login, `/api/auth/me`, and every
session check reject any account whose status is not `active`, so a valid JWT
alone is not enough. Self-signup always forces the lowest (`user`) role; roles
can never be self-elevated. Accounts have three statuses:

| Status     | Meaning                                                        |
| ---------- | ------------------------------------------------------------- |
| `pending`  | Awaiting super-admin approval; cannot sign in.               |
| `active`   | Approved; normal access per role.                            |
| `disabled` | Suspended by a super admin; cannot sign in.                  |

### Bot protection & rate limiting

- **CAPTCHA** on registration — a self-contained, signed/expiring image
  challenge (`/api/captcha`); no third-party service or key needed. The token
  carries only a salted hash of the answer, so it can't be solved by decoding.
- **Rate limiting** on every API, keyed on **client IP + device fingerprint**.
  Signup is hardcoded to **3 requests/hour**; login and general API limits are
  tunable by a super admin at `/admin/users` (persisted in the DB). Over-limit
  requests get HTTP `429`.

### Seed accounts

Created on first server start (passwords overridable via env — set these in Vercel):

| Username     | Role          | Password env var        | Default          |
| ------------ | ------------- | ----------------------- | ---------------- |
| `superadmin` | super_admin   | `SUPER_ADMIN_PASSWORD`  | `superadmin123`  |
| `admin`      | admin         | `ADMIN_PASSWORD`        | `admin123`       |
| `user`       | user          | `USER_PASSWORD`         | `user123`        |

Set `AUTH_SECRET` in production to a strong random value (JWT signing key).

### Database (PostgreSQL)

Users, tunable rate-limit settings, and rate-limit events are persisted in
**PostgreSQL** when a `DATABASE_URL` is set. The schema is created and seeded
automatically on first use — no manual migration step. If `DATABASE_URL` is
**not** set, the app transparently falls back to an in-memory store (handy for
local dev), which resets on restart.

```bash
# Local Postgres example
DATABASE_URL=postgres://user:pass@localhost:5432/ultron
```

**Free hosted Postgres** (recommended for Vercel): create a free database on
[Neon](https://neon.tech) or [Supabase](https://supabase.com), copy the
connection string into the Vercel project's `DATABASE_URL` env var. Managed TLS
connections work out of the box (`PGSSLMODE=require` is honored). See
`.env.example` for all supported variables.

## Deployment (Vercel)

Pushing to `main`/`master` auto-deploys via `.github/workflows/deploy-vercel.yml`.
The workflow needs these **GitHub repository secrets** (already configured for this repo):

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Set the app env vars (`AUTH_SECRET`, `*_PASSWORD`) in the Vercel project settings.
