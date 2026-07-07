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

### Seed accounts

Created on first server start (passwords overridable via env — set these in Vercel):

| Username     | Role          | Password env var        | Default          |
| ------------ | ------------- | ----------------------- | ---------------- |
| `superadmin` | super_admin   | `SUPER_ADMIN_PASSWORD`  | `superadmin123`  |
| `admin`      | admin         | `ADMIN_PASSWORD`        | `admin123`       |
| `user`       | user          | `USER_PASSWORD`         | `user123`        |

Set `AUTH_SECRET` in production to a strong random value (JWT signing key).

> **Persistence note:** users are stored in-memory per server instance, so
> super-admin edits persist while the instance is warm but reset on cold starts.
> For durable persistence, back `src/server/users.ts` with a database
> (e.g. set a `DATABASE_URL` and implement the same functions).

## Deployment (Vercel)

Pushing to `main`/`master` auto-deploys via `.github/workflows/deploy-vercel.yml`.
The workflow needs these **GitHub repository secrets** (already configured for this repo):

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Set the app env vars (`AUTH_SECRET`, `*_PASSWORD`) in the Vercel project settings.
