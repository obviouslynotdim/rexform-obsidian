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

## NextAuth JWT Structure

Defined in `lib/auth.ts` and `app/types/next-auth.d.ts`:

```typescript
// JWT token (server-side, encrypted in cookie)
token.userId              // string — Kratos identity UUID
token.kratosSessionToken  // string — Kratos session token
token.isAdmin             // boolean — userId === ADMIN_USER_ID

// Session object (returned to client via useSession() or getServerSession())
session.user.id           // string — Kratos identity UUID
session.user.isAdmin      // boolean
session.kratosSessionToken // string — passed to CouchDB / Oathkeeper
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
matcher: ['/((?!login|register|api/auth|api/hooks|_next/static|_next/image|favicon\\.ico).*)']
```

| Status | Routes |
|---|---|
| **Protected** (requires valid JWT) | `/dashboard`, `/notes/*`, `/api/notes/*`, `/api/admin/*`, `/api/vaults`, `/api/user/*`, `/search`, `/settings`, and everything else not listed below |
| **Public** (no auth required) | `/login`, `/register`, `/api/auth/*`, `/api/hooks/*`, `/_next/static`, `/_next/image`, `/favicon.ico` |

Authenticated users hitting `/` are redirected to `/dashboard`.

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
