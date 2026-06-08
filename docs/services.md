# Services

All 8 services running on Railway in the `production` environment.

---

## rexform-notes

| Field | Value |
|---|---|
| Technology | Next.js 14 (App Router) |
| Railway Service ID | `ddde10ba-fef1-4318-90ee-d79485f3ff0e` |
| Public URL | `https://rexform-notes-production.up.railway.app` |
| Internal URL | `http://rexform-notes.railway.internal:3000` |
| Deploy command | `railway up --service ddde10ba-fef1-4318-90ee-d79485f3ff0e --detach` |

The primary web application. Serves all UI pages and implements every API route. Acts as a trusted server-side proxy — the browser never receives admin CouchDB credentials.

**Responsibilities:**
- Renders notes UI (dashboard, sidebar, editor, settings, admin panel)
- Authenticates users via NextAuth → Kratos CredentialsProvider
- Proxies all CouchDB reads and writes on behalf of the logged-in user
- Provisions per-user CouchDB vaults and LiveSync credentials on registration
- Enforces shared vault permissions by querying Keto before every vault resolve

**Required environment variables:**
```
NEXTAUTH_URL, NEXTAUTH_SECRET
NEXT_PUBLIC_KRATOS_PUBLIC_URL, KRATOS_ADMIN_URL
COUCHDB_URL, COUCHDB_USERNAME, COUCHDB_PASSWORD
COUCHDB_PROXY_URL
ADMIN_USER_ID
KETO_READ_URL, KETO_WRITE_URL
```

---

## couch-db

| Field | Value |
|---|---|
| Technology | Apache CouchDB 3.x |
| Railway Service ID | `efa078f5-...` |
| Public URL | `https://couch-db-production.up.railway.app` |
| Internal URL | `http://couch-db.railway.internal:5984` |
| Port | 5984 |
| Persistent volume | `/opt/couchdb/data` |

The sole persistence layer for all notes. Each user's notes live in an isolated database. Also serves as the sync target for the Obsidian Self-hosted LiveSync plugin.

**Database naming:**

| Pattern | Example | Owner |
|---|---|---|
| `obsidian` | `obsidian` | Admin user |
| `vault-<userId>` | `vault-957e5bcc-...` | Regular user |
| `vault-shared-<16hex>` | `vault-shared-a1b2c3d4...` | Shared (Keto-governed) |
| `_users` | `_users` | CouchDB system — LiveSync credentials |

**Important:** Railway's internal hostname (`couch-db.railway.internal`) silently drops HTTP Basic auth headers. All admin operations in `lib/vault.ts` and `lib/couchdb-credentials.ts` use `COUCHDB_URL` (the public HTTPS domain).

**Initialization (run once after first deploy):**
```bash
curl -X POST https://couch-db-production.up.railway.app/_cluster_setup \
  -u admin:PASSWORD \
  -H "Content-Type: application/json" \
  -d '{"action":"enable_single_node","bind_address":"0.0.0.0","port":5984}'
```

---

## rexform-kratos

| Field | Value |
|---|---|
| Technology | Ory Kratos v1.2.0 |
| Railway Service ID | `e94b177f-...` |
| Public URL | `https://rexform-kratos-production.up.railway.app` |
| Admin URL (internal) | `http://kratos.railway.internal:4434` |
| Public port | 4433 |
| Admin port | 4434 |

Manages all user identity lifecycle: registration, login, session issuance, account recovery, and email verification. `rexform-notes` uses the Kratos **API flow** (not the browser flow) — the Next.js app renders its own forms and submits to Kratos programmatically.

**Identity schema** (`kratos/identity-schemas/user.schema.json`):
- `email` — required, used as password login identifier
- `name.first`, `name.last` — optional
- `additionalProperties: false`

**After-registration webhook:**
Fires `POST /api/hooks/kratos/after-register` on `rexform-notes` with `{ identity: { id, traits } }`. Creates the user's CouchDB vault. Must return 200 — Kratos requires this to complete registration.

**Required environment variables:**
```
DSN               PostgreSQL connection string
SECRETS_DEFAULT   Encryption secret (min 16 chars)
SECRETS_COOKIE    Cookie encryption secret
```

---

## oathkeeper

| Field | Value |
|---|---|
| Technology | Ory Oathkeeper |
| Railway Service ID | `d8da4063-...` |
| Public URL | `https://oathkeeper-production-316a.up.railway.app` |
| Proxy port | 4455 |
| API port | 4456 |

Reverse proxy that validates Kratos session tokens before allowing reads on the `obsidian` (admin) CouchDB database. Only **reads to the `obsidian` database** go through Oathkeeper. All writes and user-vault reads bypass it and hit CouchDB directly with admin credentials.

**Access rules:**

| Rule | Pattern | Auth |
|---|---|---|
| `couchdb-public-health` | `<**>/_up` | anonymous |
| `couchdb-authenticated` | `<**>/obsidian/<**>` | bearer_token → cookie_session |

**Authenticators:**
- `bearer_token` — reads `Authorization` header, validates at `GET /sessions/whoami` on Kratos, extracts `identity.id` as subject
- `cookie_session` — validates `ory_kratos_session` cookie (fallback)
- `anonymous` — for the health check endpoint only

**Mutator:** `noop` — request is forwarded unchanged. The upstream URL (`COUCHDB_ADMIN_URL`) contains admin credentials, so CouchDB receives an authenticated request.

**Required environment variables:**
```
COUCHDB_ADMIN_URL   http://admin:PASSWORD@couch-db.railway.internal:5984
KRATOS_PUBLIC_URL   https://rexform-kratos-production.up.railway.app
```

---

## rexform-keto

| Field | Value |
|---|---|
| Technology | Ory Keto v0.11.1 |
| Railway Service ID | `c2d60c7e-ce06-40b6-941b-dc5c1eaf682c` |
| Read URL (internal) | `http://rexform-keto.railway.internal:4466` |
| Write URL (internal) | `http://rexform-keto.railway.internal:4467` |
| Read port | 4466 |
| Write port | 4467 |

Stores and evaluates permission tuples for shared vaults. When a user accesses a `vault-shared-*` database, `resolveVault()` queries Keto to determine their role.

**Namespace:** `vault` (id: 0)  
**Relations:** `owner`, `editor`, `viewer`

**Critical deployment detail:** The base Docker image has `ENTRYPOINT ["keto"]`. The Dockerfile overrides with `ENTRYPOINT ["/bin/sh", "-c"]` and runs `echo y | keto migrate up && keto serve` to handle the non-interactive migration prompt.

**Critical usage detail:** `getVaultMembers()` MUST use the Read URL (port 4466). The Write URL (port 4467) returns empty results for list queries.

**Required environment variables:**
```
DSN                  ${{Postgres.DATABASE_URL}}
KETO_DATABASE_URL    ${{Postgres.DATABASE_URL}}
```

---

## kratos-postgres

| Field | Value |
|---|---|
| Technology | PostgreSQL (Railway managed) |
| Railway Service ID | `2b49e2de-...` |
| Internal URL | `postgresql://...@kratos-postgres.railway.internal:5432/railway` |

Exclusive data store for Ory Kratos. Stores identity records, sessions, audit logs, and verification/recovery codes. No application code touches this database directly.

---

## Postgres (Keto DB)

| Field | Value |
|---|---|
| Technology | PostgreSQL (Railway managed) |
| Railway Service ID | `44502fa0-...` |

Exclusive data store for Ory Keto. `DATABASE_URL` is auto-exposed by Railway and referenced as `${{Postgres.DATABASE_URL}}` in the Keto service. Keto runs `migrate up` on every container start.

---

## obsidian-remote

| Field | Value |
|---|---|
| Technology | `lscr.io/linuxserver/obsidian:latest` |
| Railway Service ID | `433b5fb9-...` |
| Port | 3001 (HTTPS, self-signed cert) |
| Persistent volume | `/config` |

Runs the Obsidian desktop application inside a browser via KasmVNC. Used for admin-level vault browsing and plugin management. Single-user — only one browser session at a time.

**Required environment variables:**
```
PUID          User ID for container (typically 1000)
PGID          Group ID for container (typically 1000)
CUSTOM_USER   KasmVNC username
PASSWORD      KasmVNC password
```
