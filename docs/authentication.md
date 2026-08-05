# Authentication

## Kratos Identity Schema

File: `kratos/identity-schemas/user.schema.json`

| Trait | Type | Required | Notes |
|---|---|---|---|
| `email` | string | Yes | Login identifier, verification target, recovery target |
| `name.first` | string | No | Optional display name |
| `name.last` | string | No | Optional display name |

`additionalProperties: false` — no extra fields accepted.

---

## Login Flow (Step by Step)

1. Browser requests `GET /login` — Next.js page loads
2. Page calls `GET /api/auth/kratos/flow` → Next.js proxies `GET /self-service/login/api` to Kratos
3. Kratos returns a flow object with `id` (flowId) and UI nodes
4. User submits email + password
5. Browser posts to `POST /api/auth/kratos/flow` with `{ email, password, flowId }`
6. Next.js calls `kratosFrontend.updateLoginFlow({ flow: flowId, method: 'password', identifier: email, password })`
7. Kratos verifies credentials against the hashed password in `kratos-postgres`
8. On success: Kratos returns `{ session, session_token }`
9. `session_token` becomes the `kratosSessionToken` stored in the NextAuth JWT
10. NextAuth sets an encrypted `next-auth.session-token` cookie on the browser

---

## Registration Flow (Step by Step)

1. Browser requests `GET /register`
2. Page calls `GET /api/auth/kratos/register/flow` → proxied to `GET /self-service/registration/api`
3. Kratos returns registration flow with flowId
4. User submits email + password
5. Browser posts to `POST /api/auth/kratos/register` with credentials
6. Kratos creates the identity in `kratos-postgres`, hashes the password with bcrypt
7. Kratos fires the after-registration webhook: `POST /api/hooks/kratos/after-register`
   - Payload: `{ identity: { id, traits: { email } } }`
   - Handler calls `createUserVault(identity.id)` — creates CouchDB database, seeds starter notes, provisions LiveSync credentials
   - Always returns `200` — Kratos requires this to complete registration
8. Kratos returns session; user is automatically logged in

---

## SSO Login Flow (Central REXFORM IAM)

File: `app/lib/auth.ts` — `rexformSsoProvider()`, a NextAuth OAuth provider (`id: 'rexform-sso'`), enabled only when `SSO_ISSUER_URL` / `SSO_CLIENT_ID` / `SSO_CLIENT_SECRET` are all set (`ssoEnabled`).

1. User clicks "Continue with SSO" (or arrives via an IdP-initiated `?sso=1` deep link) → `signIn('rexform-sso')`
2. NextAuth redirects to the IAM gateway (Ory Hydra) with PKCE + `state` checks
3. On callback, the `userinfo` handler merges ID-token claims with a `/userinfo` call (the gateway's `openid`-only scope means the ID token alone may carry nothing but `sub`)
4. `signIn` callback: looks up `user.email` against local Kratos identities via `findKratosByEmail()`
   - **Match found** → `user.id` is rewritten to the existing Kratos identity's ID, so the SSO login lands on the same account/vault as password login (prevents duplicate accounts per email)
   - **No match** → the user has no local Kratos identity at all; their profile is upserted into the `rexform-sso-users` CouchDB registry (`lib/sso-users.ts`) so the admin panel can still list/manage them
5. `ensureUserVault(user.id)` provisions the vault on first SSO login (the Kratos after-register webhook never fires for SSO users)
6. `jwt`/`session` callbacks set `token.provider` / `session.provider` to `'rexform-sso'`; note `session.kratosSessionToken` stays unset for SSO-only sessions

**IdP-initiated retry:** `app/app/login/page.tsx` auto-restarts the OAuth flow once if it fails with a stale "state cookie was missing" error (typical for `?sso=1` deep links that skip the local flow-init step) — guarded by a `sessionStorage` flag so a genuinely broken flow doesn't loop forever.

---

## Account & Profile Management

Routes: `app/app/api/user/profile` (GET/PATCH), `app/app/api/user/password` (POST).

- **Profile** — first/last name and a username. Storage differs by account type:
  - Local Kratos identity: name lives in `traits.name`, username lives in `identity.metadata_public.username` (not a traits-schema field — see [Kratos Identity Schema](#kratos-identity-schema) above, which has no `username` trait)
  - SSO-only account (no local Kratos identity): both live in the `rexform-sso-users` registry doc; name is overwritten on every login by the IAM's claims, so the profile page shows it read-only
  - Email is always read-only — it's the key used for SSO-to-local account linking and for admin/user lookups
- **Password** (`POST /api/user/password`) — requires the current password. It's verified by driving a fresh Kratos **native login flow** server-side (`kratosFrontend.createNativeLoginFlow()` + `updateLoginFlow()`) rather than trusting the session, because an SSO-linked session carries no `kratosSessionToken` to check against — only the credentials provider sets one. SSO-only accounts (no Kratos identity) get no password section at all.

---

## NextAuth JWT Structure

Defined in `lib/auth.ts` and `app/types/next-auth.d.ts`:

```typescript
// JWT token (server-side, encrypted in cookie)
token.userId              // string — Kratos identity UUID (or Hydra `sub` for an unlinked SSO user)
token.kratosSessionToken  // string — Kratos session token (credentials login only; unset for SSO)
token.isAdmin             // boolean — userId === ADMIN_USER_ID
token.provider            // 'credentials' | 'rexform-sso'

// Session object (returned to client via useSession() or getServerSession())
session.user.id           // string — Kratos identity UUID
session.user.isAdmin      // boolean
session.kratosSessionToken // string — passed to CouchDB / Oathkeeper; undefined for SSO-only sessions
session.provider          // 'credentials' | 'rexform-sso'
```

---

## Session Token Lifecycle

- `kratosSessionToken` is issued by Kratos and has its own expiry (managed by Kratos config)
- NextAuth stores it in a JWT but does **not** refresh it when it expires
- The JWT cookie has a separate expiry managed by `NEXTAUTH_SECRET` and NextAuth defaults
- **When the Kratos token expires but the JWT cookie is still valid:** reads through Oathkeeper return 401 (Oathkeeper rejects the stale token). Writes are unaffected because they bypass Oathkeeper and use admin credentials directly

---

## Middleware Route Protection

File: `app/middleware.ts`

```typescript
matcher: ['/((?!login|register|api/hooks|_next/static|_next/image|favicon\\.ico).*)']
```

`api/auth` is intentionally **in** the matcher now (it was excluded previously) — the middleware needs to see those requests to rate-limit them. It's still effectively public: a `PUBLIC_PREFIXES` check (`/api/auth`, `/api/hooks`) short-circuits before the `withAuth` JWT check runs.

| Status | Routes |
|---|---|
| **Protected** (requires valid JWT) | `/dashboard`, `/notes/*`, `/api/notes/*`, `/api/admin/*`, `/api/vaults`, `/api/user/*`, `/search`, `/settings`, and everything else not listed below |
| **Public** (no auth required) | `/login`, `/register`, `/api/auth/*`, `/api/hooks/*`, `/_next/static`, `/_next/image`, `/favicon.ico` |

Authenticated users hitting `/` are redirected — admins to `/admin`, everyone else to `/notes` (not `/dashboard`).

The middleware also enforces per-IP rate limits (see [Security → Rate Limiting](security.md#rate-limiting)) before the auth check runs.

---

## How Oathkeeper Validates Requests

Applies only to `GET` reads on the `obsidian` (admin) vault. All other CouchDB operations bypass Oathkeeper.

1. `rexform-notes` sends `Authorization: Bearer <kratosSessionToken>` to Oathkeeper's proxy port (4455)
2. Oathkeeper's `bearer_token` authenticator extracts the token from the `Authorization` header
3. Oathkeeper calls `GET /sessions/whoami` on Kratos with the token
4. If Kratos confirms the session is valid, the subject is set to `identity.id`
5. The `allow` authorizer permits the request (access control is handled at the Next.js layer)
6. The `noop` mutator forwards the request unchanged to the upstream URL
7. The upstream URL (`COUCHDB_ADMIN_URL`) is `http://admin:PASSWORD@couch-db.railway.internal:5984` — admin credentials are injected here, not by Next.js

**Why writes bypass Oathkeeper:**
Kratos session tokens expire on their own schedule. NextAuth does not refresh them. A stale token causes Oathkeeper to reject writes with 401, silently breaking saves. `fetchFromVault()` in `lib/couchdb.ts` routes all `PUT`, `POST`, `DELETE`, and `PATCH` operations directly to CouchDB with admin credentials. The session is already validated at the Next.js API layer.

```
READ  (admin vault) → rexform-notes → Oathkeeper → CouchDB
WRITE (any vault)   → rexform-notes → CouchDB (admin creds, direct)
READ  (user vault)  → rexform-notes → CouchDB (admin creds, direct)
```

---

## Admin Access

`isAdminUser(userId)` in `lib/vault.ts` checks `userId === process.env.ADMIN_USER_ID`.

When true:
- User is routed to the `obsidian` vault regardless of cookies or params
- `isAdmin: true` is set in the JWT
- `session.user.isAdmin` is exposed to the client

Admin accounts cannot be deleted, suspended, or have their vault deleted via the admin panel (enforced in every admin API route).
