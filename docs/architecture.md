# REXFORM Notes — Architecture & Railway Services

> Complete reference for the production deployment on Railway project `rexform-obsidian`.

---

## Service Map

| Service | Railway ID | Technology | Role |
|---|---|---|---|
| `rexform-notes` | `ddde10ba` | Next.js 14 | Main web application |
| `rexform-kratos` | `e94b177f` | Ory Kratos | Identity & authentication |
| `kratos-postgres` | `2b49e2de` | PostgreSQL | Kratos database |
| `couch-db` | `efa078f5` | CouchDB 3 | Notes database & LiveSync target |
| `oathkeeper` | `d8da4063` | Ory Oathkeeper | CouchDB read proxy |
| `rexform-keto` | `c2d60c7e` | Ory Keto v0.11 | Shared vault permissions |
| `Postgres` | `44502fa0` | PostgreSQL | Keto database |
| `obsidian-remote` | `433b5fb9` | linuxserver/obsidian | Browser-based Obsidian desktop |

All services live in the `production` environment (`d3975300-8402-4f76-906a-7469b3cde4c2`).

---

## Service Details

### rexform-notes
The Next.js 14 App Router application. Every user-facing page and API route lives here.

**Key responsibilities:**
- Serves the notes UI (sidebar, editor, dashboard, settings, admin panel)
- Authenticates users via NextAuth → Kratos credentials provider
- Proxies all CouchDB reads and writes on behalf of the logged-in user
- Provisions per-user CouchDB vaults and LiveSync credentials on registration
- Enforces shared vault permissions by querying Keto before every vault resolve

**Relevant env vars:**
```
NEXTAUTH_SECRET, NEXTAUTH_URL
KRATOS_PUBLIC_URL, KRATOS_ADMIN_URL
COUCHDB_URL, COUCHDB_USERNAME, COUCHDB_PASSWORD
COUCHDB_PROXY_URL         # Oathkeeper public URL
KETO_READ_URL, KETO_WRITE_URL
ADMIN_USER_ID             # UUID of the admin account
```

---

### rexform-kratos
Ory Kratos handles all identity lifecycle: registration, login, account recovery, and session management.

**Key responsibilities:**
- Stores user identities (email + hashed password) in `kratos-postgres`
- Issues session tokens (`kratosSessionToken`) consumed by NextAuth
- Fires the after-registration webhook → `POST /api/hooks/kratos/after-register` on `rexform-notes`, which creates the new user's CouchDB vault
- Admin API used by `rexform-notes` to list/delete identities

**Flow on login:**
```
Browser → POST /api/auth/kratos/flow (rexform-notes)
        → Kratos credentials API (username + password)
        → Kratos issues session token
        → NextAuth stores token in encrypted JWT cookie
```

---

### kratos-postgres
Standard managed PostgreSQL. Stores Kratos identity records, sessions, and audit events. No application code touches this directly — only Kratos does.

---

### couch-db
CouchDB 3 is the persistence layer for all notes. Each user's notes live in their own isolated database.

**Database naming:**
| Database | Owner | Purpose |
|---|---|---|
| `obsidian` | Admin user | Admin vault |
| `vault-<userId>` | Regular user | Per-user private vault |
| `vault-shared-<16hex>` | Shared | Collaborative vault |
| `_users` | System | CouchDB credential store for LiveSync |

**Access control per vault (`_security`):**
- Personal vaults: `members.names = [userId]` — only that user's CouchDB credentials can connect directly (LiveSync). `rexform-notes` always uses admin credentials server-side.
- Shared vaults: `members.names = [userId1, userId2, ...]` — populated/maintained by `syncVaultSecurity()` whenever Keto membership changes.

**Why the public URL must be used for admin ops:**
Railway's internal hostname (`couch-db.railway.internal:5984`) silently drops Basic auth headers. All admin operations in `lib/vault.ts` and `lib/couchdb.ts` use `COUCHDB_URL` (public domain).

---

### oathkeeper
Ory Oathkeeper sits in front of CouchDB and validates Kratos bearer tokens before allowing reads on the admin vault.

**What it does:**
- Receives `Authorization: Bearer <kratosSessionToken>` from `rexform-notes`
- Validates the token against Kratos session check API
- If valid, forwards the request to CouchDB with admin Basic auth injected (mutator)
- If invalid, returns 401

**Why writes bypass Oathkeeper:**
Kratos session tokens expire on their own schedule. NextAuth does not refresh them. A stale token causes Oathkeeper to reject writes with 401, silently breaking saves. `fetchFromVault()` in `lib/couchdb.ts` routes all `PUT/POST/DELETE/PATCH` directly to CouchDB with admin credentials — the session is already validated at the Next.js API layer.

```
READ  (admin vault) → rexform-notes → Oathkeeper → CouchDB
WRITE (any vault)   → rexform-notes → CouchDB (admin creds, direct)
READ  (user vault)  → rexform-notes → CouchDB (admin creds, direct)
```

---

### rexform-keto
Ory Keto v0.11 stores and evaluates permission relation-tuples for shared vaults.

**Namespace:** `vault`  
**Relations:** `owner`, `editor`, `viewer`  
**Subject:** `userId` (Kratos identity UUID)  
**Object:** `vault-shared-<hex>` (CouchDB database name)

**Example tuples:**
```
vault:vault-shared-abc123#owner@user-uuid-1
vault:vault-shared-abc123#editor@user-uuid-2
vault:vault-shared-abc123#viewer@user-uuid-3
```

**Ports:**
- `4466` — Read API (`/relation-tuples`, `/relation-tuples/check`)
- `4467` — Write API (`/admin/relation-tuples`)

**Important:** `getVaultMembers()` must use the **Read URL (4466)**, not the Write URL. The Write API returns empty results for list queries.

**When permissions are checked:**
- `resolveVault()` (called on every note API request) checks Keto if the requested vault is `vault-shared-*`
- `canWrite` is `false` for `viewer` role — write routes return 403

**When permissions are written:**
- Shared vault created → creator gets `owner` tuple
- Admin panel adds/changes/removes member → Keto tuples updated, then `syncVaultSecurity()` updates CouchDB `_security` to match

---

### Postgres (Keto DB)
Railway managed PostgreSQL dedicated to Keto. Keto runs `migrate up` on every container start. `DATABASE_URL` is auto-exposed by Railway and referenced as `DSN = ${{Postgres.DATABASE_URL}}` in the Keto service env.

---

### obsidian-remote
Runs the Obsidian desktop app in a browser via KasmVNC (`linuxserver/obsidian`). Primarily used for admin-level vault browsing. Single-user access.

**Port:** `3001` (HTTPS, self-signed cert)  
**Volume:** `/config` — must be persistent (vault files + plugin settings)

---

## Data Flow

### Registration
```
User registers
  → Kratos creates identity in kratos-postgres
  → Kratos fires webhook → rexform-notes /api/hooks/kratos/after-register
      → createUserVault(userId)
          → CouchDB: PUT /vault-<userId>         (create DB)
          → CouchDB: PUT /vault-<userId>/_security (lock to user)
          → CouchDB: seed 3 starter notes
          → CouchDB: PUT /_users/org.couchdb.user:<userId> (LiveSync creds)
          → CouchDB: configure CORS (idempotent)
```

### Login & note access
```
User logs in
  → NextAuth ← Kratos credentials flow
  → kratosSessionToken stored in encrypted JWT cookie

User opens notes
  → GET /api/notes?page=1&limit=20
      → resolveVault(session) → reads rexform-active-vault cookie
      → fetchFromVault(_all_docs, admin creds, vault-<userId>)
      → filter to .md files only, sort by mtime, paginate
```

### Shared vault access
```
Admin creates shared vault
  → POST /api/admin/vaults
      → createSharedVault(name, creatorId) in CouchDB
      → grantVaultAccess(vaultId, creatorId, 'owner') in Keto
      → syncVaultSecurity(vaultId) → updates CouchDB _security.members.names

Admin adds member
  → POST /api/admin/vaults/[vaultId]/members
      → revoke existing role (if any) in Keto
      → grant new role in Keto
      → syncVaultSecurity(vaultId) → CouchDB _security updated

Member accesses shared vault
  → resolveVault(session, 'vault-shared-xxx')
      → checkVaultAccess(vaultId, userId, role) via Keto Read API (4466)
      → returns { db: 'vault-shared-xxx', canWrite: true/false }
  → fetchFromVault(path, admin creds, vault-shared-xxx)
```

### Obsidian LiveSync (direct CouchDB sync)
```
User opens Settings → copies Server URL, Database, Username, Password
  → These are the CouchDB _users credentials (not the admin password)
  → CouchDB: org.couchdb.user:<userId> with a generated password

Obsidian LiveSync plugin connects:
  → HTTPS → couch-db-production.up.railway.app
  → Authenticates as userId (not admin)
  → CouchDB _security.members.names allows this user into vault-<userId>
  → Bidirectional sync: local vault ↔ CouchDB vault-<userId>
```

---

## Admin Operations

### Provision a missing vault
`POST /api/admin/users/[id]/provision` — runs the same vault creation flow as registration.

### Delete a user
`DELETE /api/admin/users/[id]/vault` — deletes:
1. Kratos identity (from kratos-postgres)
2. CouchDB vault database (`vault-<userId>`)
3. CouchDB `_users` credential doc

### Delete only the vault (keep account)
`DELETE /api/admin/users/[id]/vault-db` — deletes CouchDB vault + credentials, Kratos identity is preserved. User can be re-provisioned.

### Delete a shared vault
`DELETE /api/admin/vaults/[vaultId]` — revokes all Keto tuples, then drops the CouchDB database.

---

## Key Architectural Decisions

| Decision | Reason |
|---|---|
| Writes bypass Oathkeeper | Kratos session tokens expire; stale tokens cause silent 401s on saves |
| Public CouchDB URL for admin ops | Railway internal hostname drops Basic auth headers |
| Keto Read API (4466) for member lists | Write API (4467) returns empty for list queries |
| `echo y \| keto migrate up` in Dockerfile | v0.11 has no `--yes` flag; prompts interactively |
| `syncVaultSecurity()` on every Keto change | LiveSync needs `_security.members.names` in sync with Keto tuples |
| Admin credentials for all server-side CouchDB calls | Consistent, never expires, auth already enforced at Next.js API layer |

---

## Deploy Command

```bash
railway up --service ddde10ba-fef1-4318-90ee-d79485f3ff0e --detach
```

GitHub push to `main` also triggers auto-deploy on `rexform-notes`.
