# REXFORM Notes — Technical Documentation

> Generated from codebase as of June 2026. All code references point to actual implementation.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagrams](#2-architecture-diagrams)
3. [Service Documentation](#3-service-documentation)
4. [Authentication & Security](#4-authentication--security)
5. [Encryption & Data Security](#5-encryption--data-security)
6. [Database Schema](#6-database-schema)
7. [API Reference](#7-api-reference)
8. [Vault Management](#8-vault-management)
9. [Permission Model](#9-permission-model)
10. [Environment Variables Reference](#10-environment-variables-reference)
11. [Deployment Guide](#11-deployment-guide)
12. [Known Limitations & Future Work](#12-known-limitations--future-work)

---

## 1. System Overview

### What REXFORM Notes Is

REXFORM Notes is a self-hosted, multi-user note-taking platform built on top of Obsidian's sync protocol. Each registered user gets a private CouchDB database (vault) for their notes. Notes are written in Markdown and rendered with GFM support. Users can connect the Obsidian desktop app or mobile app directly to their vault via the Self-hosted LiveSync plugin for offline-capable sync.

The platform supports:
- **Per-user private vaults** — isolated CouchDB databases, one per user
- **Shared vaults** — collaborative workspaces with owner/editor/viewer roles enforced by Ory Keto
- **Admin panel** — user management, vault provisioning, suspension, shared vault administration
- **LiveSync credentials** — per-user CouchDB credentials for direct Obsidian app sync
- **Obsidian-remote** — browser-based Obsidian desktop (single admin session)

### High-Level Architecture

```
Browser / Obsidian App
        │
        ├── rexform-notes (Next.js 14)   ← main app, all API routes
        │       │
        │       ├── Ory Kratos           ← identity, login, registration, sessions
        │       │       └── kratos-postgres
        │       │
        │       ├── Ory Oathkeeper       ← CouchDB read proxy (admin vault only)
        │       │
        │       ├── Ory Keto             ← shared vault permission tuples
        │       │       └── Postgres (keto DB)
        │       │
        │       └── CouchDB              ← notes storage, LiveSync target
        │
        └── obsidian-remote              ← browser Obsidian (admin use)
```

### Tech Stack

| Service | Technology | Version | Purpose |
|---|---|---|---|
| rexform-notes | Next.js | 14.2.35 | Web app and API |
| rexform-notes | React | 18 | UI rendering |
| rexform-notes | NextAuth.js | 4.24.14 | Session management |
| rexform-notes | TypeScript | 5 | Type safety |
| rexform-notes | Tailwind CSS | 3.4.1 | Styling |
| rexform-notes | SWR | 2.2.5 | Client-side data fetching |
| rexform-notes | react-markdown + remark-gfm | 9.0.1 / 4.0.0 | Markdown rendering |
| rexform-notes | @ory/kratos-client | 26.2.0 | Kratos API SDK |
| rexform-notes | @ory/keto-client | 26.2.0 | Keto API SDK |
| couch-db | Apache CouchDB | 3.x | Notes database |
| rexform-kratos | Ory Kratos | v1.2.0 | Identity & auth |
| kratos-postgres | PostgreSQL | managed | Kratos data store |
| oathkeeper | Ory Oathkeeper | latest | CouchDB read proxy |
| rexform-keto | Ory Keto | v0.11.1 | Permission engine |
| Postgres (keto) | PostgreSQL | managed | Keto data store |
| obsidian-remote | linuxserver/obsidian | latest | Browser Obsidian |

---

## 2. Architecture Diagrams

### Diagram 1 — Request Flow

Full lifecycle from browser to CouchDB.

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as Middleware
    participant AR as API Route
    participant RV as resolveVault()
    participant FV as fetchFromVault()
    participant OA as Oathkeeper :4455
    participant DB as CouchDB :5984

    B->>MW: Request + session cookie
    MW->>MW: withAuth — decrypt JWT, check token present
    alt No valid token
        MW-->>B: 302 Redirect → /login
    else Valid token
        MW->>AR: Forward request
        AR->>AR: getServerSession(authOptions)
        AR->>RV: resolveVault(session, ?vault)
        RV-->>AR: { db, canWrite }
        AR->>FV: fetchFromVault(path, opts, auth, db)
        alt READ on admin vault (obsidian)
            FV->>OA: GET /obsidian/... + Authorization: Bearer <kratosToken>
            OA->>OA: validate via GET /sessions/whoami on Kratos
            OA->>DB: GET /obsidian/... + admin Basic Auth (injected)
            DB-->>OA: Document JSON
            OA-->>FV: Document JSON
        else WRITE or user/shared vault
            FV->>DB: PUT/POST/DELETE + admin Basic Auth (direct, bypass Oathkeeper)
            DB-->>FV: Response
        end
        FV-->>AR: Response
        AR-->>B: JSON response
    end
```

### Diagram 2 — Authentication Flow

Login and registration lifecycle.

```mermaid
sequenceDiagram
    participant U as User
    participant NJ as Next.js /login
    participant KR as Kratos Public API
    participant NA as NextAuth /api/auth

    U->>NJ: GET /login
    NJ->>KR: GET /self-service/login/api
    KR-->>NJ: { id: flowId, ... }
    NJ-->>U: Render login form (flowId embedded)

    U->>NJ: POST /api/auth/kratos/flow { email, password, flowId }
    NJ->>KR: updateLoginFlow({ flow: flowId, method: password, ... })
    KR->>KR: Verify credentials against hashed password in postgres
    KR-->>NJ: { session, session_token }

    NJ->>NA: authorize() → return { id, email, kratosSessionToken }
    NA->>NA: jwt() callback → token.userId, token.kratosSessionToken, token.isAdmin
    NA-->>U: Set-Cookie: next-auth.session-token (encrypted JWT)

    Note over U,NA: Subsequent requests include the session cookie
    U->>NJ: Any protected request
    NJ->>NA: Decrypt JWT → session object
    NA-->>NJ: session.user.id, session.kratosSessionToken, session.user.isAdmin
```

### Diagram 3 — Vault Isolation

How different users are routed to different CouchDB databases.

```mermaid
flowchart TD
    UA[User A<br/>id: abc-123] -->|getUserVaultName| VA[(vault-abc-123)]
    UB[User B<br/>id: def-456] -->|getUserVaultName| VB[(vault-def-456)]
    ADM[Admin User<br/>ADMIN_USER_ID match] -->|getAdminVaultName| VO[(obsidian)]
    UC[User C] -->|Keto: owner| VS[(vault-shared-xyz789)]
    UD[User D] -->|Keto: editor| VS
    UE[User E] -->|Keto: viewer → canWrite=false| VS

    VA -->|_security.members=[abc-123]| CDB[(CouchDB)]
    VB -->|_security.members=[def-456]| CDB
    VO -->|_security.admins=[admin]| CDB
    VS -->|_security.members=[userC,userD,userE]| CDB

    style VA fill:#1e3a5f
    style VB fill:#1e3a5f
    style VO fill:#3d1f00
    style VS fill:#1f3d1f
```

### Diagram 4 — Note Creation Flow

What happens when a user creates a new note.

```mermaid
sequenceDiagram
    participant E as NewNotePage
    participant A as POST /api/notes/create
    participant RV as resolveVault()
    participant FV as fetchFromVault()
    participant DB as CouchDB

    E->>A: POST { title: "My Note", content: "# My Note..." }
    A->>A: getServerSession — verify auth
    A->>RV: resolveVault(session, ?vault param)
    RV-->>A: { db: "vault-abc-123", canWrite: true }

    Note over A: Derive IDs from title
    Note over A: id = "My Note.md"
    Note over A: chunkId = "My Note.md_c0"

    A->>FV: PUT "My Note.md_c0" { _id, data: content }
    FV->>DB: PUT /vault-abc-123/My%20Note.md_c0 (admin creds)
    DB-->>FV: { ok: true, rev: "1-xxx" }

    A->>FV: PUT "My Note.md" { _id, path, type, title, mtime, children: ["My Note.md_c0"] }
    FV->>DB: PUT /vault-abc-123/My%20Note.md (admin creds)
    DB-->>FV: { ok: true, rev: "1-yyy" }

    A-->>E: 201 { id: "My Note.md", title, path }
    E->>E: router.push("/notes/My%20Note.md")
```

### Diagram 5 — Permission Check Flow

How Keto permissions are evaluated for shared vault access.

```mermaid
flowchart TD
    REQ[Incoming API Request] --> GS[getServerSession]
    GS --> TK{Valid JWT token?}
    TK -->|No| E401[401 Unauthorized]
    TK -->|Yes| RV[resolveVault session, vaultParam]

    RV --> VP{vaultParam provided?}
    VP -->|No| CV[getActiveVault<br/>read rexform-active-vault cookie]
    CV --> RET1[return db=activeVault, canWrite=true]

    VP -->|Yes| PV{isPersonalVault?}
    PV -->|Yes - matches vault-userId| RET2[return db=vaultParam, canWrite=true]

    PV -->|No - vault-shared-*| KETO[checkVaultAccess × 3<br/>Keto GET /relation-tuples/check]
    KETO --> KR{Role found?}
    KR -->|owner| RET3[canWrite=true]
    KR -->|editor| RET4[canWrite=true]
    KR -->|viewer| RET5[canWrite=false]
    KR -->|none / Keto error| FB[fallback: getActiveVault]

    RET1 --> EXEC[Execute CouchDB operation<br/>fetchFromVault admin creds]
    RET2 --> EXEC
    RET3 --> EXEC
    RET4 --> EXEC
    RET5 --> CW{canWrite required?}
    CW -->|write route| E403[403 Read-only access]
    CW -->|read route| EXEC
    FB --> EXEC
```

---

## 3. Service Documentation

### rexform-notes

| Field | Value |
|---|---|
| Technology | Next.js 14 (App Router) |
| Railway ID | `ddde10ba-fef1-4318-90ee-d79485f3ff0e` |
| Internal URL | `http://rexform-notes.railway.internal:3000` |
| Public URL | `https://rexform-notes-production.up.railway.app` |
| Deploy | `railway up --service ddde10ba --detach` or auto on `git push origin main` |

**Purpose:** The primary web application. Serves all UI pages and implements every API route. Acts as a trusted server-side proxy between the browser and CouchDB — the browser never has admin CouchDB credentials.

**Key configuration:**
- `next.config.js` — no special rewrites; API routes are co-located in `app/app/api/`
- All pages under `app/app/` except `/login`, `/register`, and webhook paths are protected by `middleware.ts`
- `force-dynamic` export on all data-fetching pages to prevent stale SSR caching

**Required environment variables:**

```
NEXTAUTH_URL, NEXTAUTH_SECRET
NEXT_PUBLIC_KRATOS_PUBLIC_URL, KRATOS_ADMIN_URL
COUCHDB_URL, COUCHDB_USERNAME, COUCHDB_PASSWORD
COUCHDB_ADMIN_USER, COUCHDB_ADMIN_PASSWORD
COUCHDB_PROXY_URL
ADMIN_USER_ID
KETO_READ_URL, KETO_WRITE_URL
```

---

### couch-db

| Field | Value |
|---|---|
| Technology | Apache CouchDB 3.x |
| Railway ID | `efa078f5-...` |
| Internal URL | `http://couch-db.railway.internal:5984` |
| Public URL | `https://couch-db-production.up.railway.app` |
| Port | 5984 |

**Purpose:** The sole persistence layer for all notes. Each user's notes live in an isolated database. Also serves as the sync target for the Obsidian Self-hosted LiveSync plugin — users connect their Obsidian apps directly to this service using per-user credentials.

**Key configuration:**
- Single-node cluster (initialized via `/_cluster_setup`)
- CORS configured programmatically by `configureCouchDbCors()` in `lib/couchdb-credentials.ts`
- `_users` system database created on first credential provision (`ensureUsersDb()`)

**Important operational note:** Railway's internal hostname (`couch-db.railway.internal:5984`) silently drops HTTP Basic auth headers. All admin operations in `lib/vault.ts` and `lib/couchdb-credentials.ts` use `COUCHDB_URL` (the public HTTPS domain) instead.

**Volume:** `/opt/couchdb/data` — must be a persistent Railway volume.

---

### rexform-kratos

| Field | Value |
|---|---|
| Technology | Ory Kratos v1.2.0 |
| Railway ID | `e94b177f-...` |
| Public URL | `https://rexform-kratos-production.up.railway.app` |
| Internal Admin URL | `http://kratos.railway.internal:4434` |
| Public Port | 4433 |
| Admin Port | 4434 |

**Purpose:** Manages all user identity lifecycle: registration, login, session issuance, account recovery, and email verification. `rexform-notes` uses the Kratos API flow (not the browser flow) — the Next.js app renders its own login/register forms and submits to Kratos programmatically.

**Key configuration (kratos.yml):**
- Identity schema: `email` (required, used as password identifier), `name.first`, `name.last` (optional)
- Login flow lifespan: 10 minutes
- Registration flow lifespan: 10 minutes
- After-registration webhook: fires `POST https://rexform-notes.../api/hooks/kratos/after-register`
- Verification and recovery flows enabled (code-based via email)
- SMTP: configured but not production-ready (points to localhost mailhog)

**DSN:** Injected via `DSN` environment variable pointing to `kratos-postgres`.

---

### oathkeeper (rexform-oathkeeper)

| Field | Value |
|---|---|
| Technology | Ory Oathkeeper |
| Railway ID | `d8da4063-...` |
| Public URL | `https://oathkeeper-production-316a.up.railway.app` |
| Proxy Port | 4455 |
| API Port | 4456 |

**Purpose:** Reverse proxy that validates Kratos session tokens before allowing read access to the `obsidian` (admin) CouchDB database. Prevents direct unauthenticated access to CouchDB from the browser.

**Access rules:**
| Rule | Pattern | Auth | Purpose |
|---|---|---|---|
| `couchdb-public-health` | `<**>/_up` | anonymous | Health check |
| `couchdb-authenticated` | `<**>/obsidian/<**>` | bearer_token → cookie_session | Authenticated reads |

**Authenticators:**
- `bearer_token`: reads `Authorization` header, validates token at `GET /sessions/whoami` on Kratos, extracts `identity.id` as subject
- `cookie_session`: validates `ory_kratos_session` browser cookie (fallback for future browser flow)
- `anonymous`: used for public health check endpoint only

**Mutator:** `noop` — Oathkeeper does not transform the forwarded request. The upstream URL (`COUCHDB_ADMIN_URL`) already contains admin credentials, so CouchDB receives the request authenticated.

**Important:** Only reads to the `obsidian` database go through Oathkeeper. All writes and user-vault reads bypass Oathkeeper and hit CouchDB directly with admin credentials (see `fetchFromVault()` in `lib/couchdb.ts`).

---

### rexform-keto

| Field | Value |
|---|---|
| Technology | Ory Keto v0.11.1 |
| Railway ID | `c2d60c7e-ce06-40b6-941b-dc5c1eaf682c` |
| Internal Read URL | `http://rexform-keto.railway.internal:4466` |
| Internal Write URL | `http://rexform-keto.railway.internal:4467` |
| Read Port | 4466 |
| Write Port | 4467 |

**Purpose:** Stores and evaluates permission tuples for shared vaults. When a user tries to access `vault-shared-*`, `resolveVault()` queries Keto to check if that user has `owner`, `editor`, or `viewer` relation on the vault object.

**Namespace:** `vault` (id: 0)

**Key deployment detail:** The base Docker image has `ENTRYPOINT ["keto"]`. The Dockerfile overrides this with `ENTRYPOINT ["/bin/sh", "-c"]` and runs `echo y | keto migrate up && keto serve` in the CMD to handle the non-interactive migration prompt.

**DSN:** `KETO_DATABASE_URL` env var pointing to the dedicated `Postgres` service.

---

### kratos-postgres

| Field | Value |
|---|---|
| Technology | PostgreSQL (Railway managed) |
| Railway ID | `2b49e2de-...` |
| Internal URL | `postgresql://...@kratos-postgres.railway.internal:5432/railway` |

**Purpose:** Exclusive data store for Ory Kratos. Stores identity records, sessions, audit logs, and verification/recovery codes. No application code touches this database directly.

---

### obsidian-remote

| Field | Value |
|---|---|
| Technology | `lscr.io/linuxserver/obsidian:latest` |
| Railway ID | `433b5fb9-...` |
| Port | 3001 (HTTPS, self-signed) |

**Purpose:** Runs the Obsidian desktop application inside a browser via KasmVNC. Primarily used for admin-level vault browsing and plugin management. Single-user — only one browser session at a time.

**Volume:** `/config` — must be persistent (stores the vault, installed plugins, and all Obsidian settings).

---

## 4. Authentication & Security

### Kratos Identity Schema

File: `kratos/identity-schemas/user.schema.json`

```json
{
  "traits": {
    "email": "string (required) — login identifier, verification, recovery",
    "name": {
      "first": "string (optional)",
      "last":  "string (optional)"
    }
  }
}
```

- `email` is the only credential identifier (used for password login)
- `name.first` and `name.last` are stored but not displayed in the app UI currently
- `additionalProperties: false` — no extra fields allowed in traits

### Login Flow (Step by Step)

1. Browser requests `GET /login` — Next.js page loads
2. Page calls `GET /api/auth/kratos/flow` → Next.js proxies `GET /self-service/login/api` to Kratos
3. Kratos returns a flow object with `id` (flowId) and UI nodes
4. User submits email + password
5. Browser posts to `POST /api/auth/kratos/flow` with `{ email, password, flowId }`
6. Next.js calls `kratosFrontend.updateLoginFlow({ flow: flowId, method: 'password', identifier: email, password })`
7. Kratos verifies credentials against the hashed password in `kratos-postgres`
8. On success: Kratos returns `{ session, session_token }`
9. `session_token` is the `kratosSessionToken` stored in the NextAuth JWT
10. NextAuth sets an encrypted `next-auth.session-token` cookie on the browser

### Registration Flow (Step by Step)

1. Browser requests `GET /register`
2. Page calls `GET /api/auth/kratos/register/flow` → proxied to `GET /self-service/registration/api`
3. Kratos returns registration flow with flowId
4. User submits email + password
5. Browser posts to `POST /api/auth/kratos/register` with credentials
6. Kratos creates the identity in `kratos-postgres`, hashes the password with bcrypt
7. Kratos fires the after-registration webhook: `POST /api/hooks/kratos/after-register` with `{ identity: { id, traits } }`
8. Webhook handler calls `createUserVault(identity.id)` — creates CouchDB database, seeds starter notes, provisions LiveSync credentials
9. Webhook always returns 200 (vault failure is non-fatal — Kratos requires 200 to complete registration)
10. Kratos returns session; user is auto-logged in

### Session Token Lifecycle

- `kratosSessionToken` is issued by Kratos and has its own expiry (managed by Kratos configuration)
- NextAuth stores it in a JWT but does **not** refresh it when it expires
- The JWT cookie itself has a separate expiry managed by `NEXTAUTH_SECRET` and NextAuth defaults
- When the Kratos token expires but the JWT cookie is still valid: reads through Oathkeeper will return 401 (Oathkeeper rejects the stale token). This is why all writes bypass Oathkeeper and use admin credentials directly.

### NextAuth JWT Structure

Defined in `lib/auth.ts` callbacks and `app/types/next-auth.d.ts`:

```typescript
// JWT token fields (server-side, encrypted)
token.userId           // string — Kratos identity ID
token.kratosSessionToken  // string — Kratos session token
token.isAdmin          // boolean — userId === ADMIN_USER_ID

// Session object (returned to client)
session.user.id        // string — Kratos identity ID
session.user.isAdmin   // boolean
session.kratosSessionToken  // string — passed to CouchDB/Oathkeeper
```

### Middleware Protection

File: `app/middleware.ts`

```typescript
matcher: ['/((?!login|register|api/auth|api/hooks|_next/static|_next/image|favicon\\.ico).*)']
```

**Protected** (requires valid JWT): everything not matching the exclusion pattern, including `/dashboard`, `/notes/*`, `/api/notes/*`, `/api/admin/*`, `/api/vaults`, `/api/user/*`, `/search`, `/settings`

**Public** (no auth required):
- `/login`, `/register` — auth pages
- `/api/auth/*` — NextAuth endpoints
- `/api/hooks/*` — Kratos webhooks (called by Kratos, not the browser)
- `/_next/static`, `/_next/image`, `/favicon.ico` — Next.js assets

Additionally, `/` redirects to `/dashboard` when a valid token is present.

### How Oathkeeper Validates Requests

1. `rexform-notes` sends `Authorization: Bearer <kratosSessionToken>` to Oathkeeper's proxy port (4455)
2. Oathkeeper's `bearer_token` authenticator extracts the token from the `Authorization` header
3. Oathkeeper calls `GET /sessions/whoami` on Kratos with the token
4. If Kratos confirms the session is valid, the subject is set to `identity.id`
5. The `allow` authorizer always permits (access control is handled at the Next.js layer)
6. The `noop` mutator forwards the request unchanged to the upstream URL
7. The upstream URL (`COUCHDB_ADMIN_URL`) is `http://admin:PASSWORD@couch-db.railway.internal:5984` — admin credentials are injected here, not by Next.js

---

## 5. Encryption & Data Security

### What Is Encrypted

| Layer | Mechanism | Details |
|---|---|---|
| NextAuth JWT cookie | AES-256-GCM (via `NEXTAUTH_SECRET`) | Session cookie is encrypted on the client; server decrypts on every request |
| Kratos identity passwords | bcrypt (managed by Kratos) | Passwords never stored in plaintext; bcrypt with default cost factor |
| CouchDB transport | HTTPS (Railway TLS termination) | All traffic between browser and `couch-db-production.up.railway.app` is TLS |
| Oathkeeper transport | HTTPS (Railway TLS termination) | Traffic to Oathkeeper public endpoint is TLS |
| Kratos transport | HTTPS (Railway TLS termination) | Traffic to Kratos public endpoint is TLS |
| Kratos cookie encryption | `SECRETS_COOKIE` env var on Kratos | Browser-flow session cookies encrypted |
| Kratos cipher secret | `SECRETS_DEFAULT` env var on Kratos | Used for additional encryption of sensitive Kratos data |

### What Is NOT Encrypted (and Why)

| Item | Status | Reason |
|---|---|---|
| Note content in CouchDB | Not encrypted at rest | Notes stored as plaintext JSON in CouchDB documents. CouchDB does not support transparent field-level encryption. Trade-off: enables full-text search and Oathkeeper proxy. Obsidian LiveSync offers E2E encryption at the plugin level — not currently configured. |
| Railway internal traffic | HTTP (not HTTPS) | All inter-service traffic on `*.railway.internal` is HTTP. Railway's internal network is isolated and not exposed to the internet. |
| CouchDB `livesync_password` field | Plaintext in `_users` doc | CouchDB hashes the `password` field automatically (bcrypt). We store the plaintext password in a separate `livesync_password` custom field so `getUserCredentials()` can retrieve it for display in the Settings page. This is a deliberate trade-off for LiveSync UX. |
| Admin credentials in env vars | Plaintext env vars | `COUCHDB_ADMIN_PASSWORD` is stored as a Railway environment variable. Not encrypted at rest in Railway's config store. |

### Per-User CouchDB Credential Scoping

Each user's LiveSync credentials are scoped to their own vault only:

1. A CouchDB `_users` document is created: `org.couchdb.user:<userId>`
2. The generated password authenticates as that userId in CouchDB
3. `vault-<userId>/_security.members.names` includes `userId`
4. CouchDB enforces that this user can only access databases where they appear in `_security`
5. The user cannot access other users' vaults, the `obsidian` vault, or the `_users` database

### Admin Password Rotation

In Phase 3, the CouchDB admin password was rotated from `obsidian123` to a secure value. The rotation was performed via:

```bash
curl -X PUT https://couch-db-production.up.railway.app/_node/nonode@nohost/_config/admins/admin \
  -u admin:old_password \
  -H "Content-Type: application/json" \
  -d '"new_password"'
```

After rotation, `COUCHDB_PASSWORD`, `COUCHDB_ADMIN_PASSWORD`, and `COUCHDB_ADMIN_URL` (in Oathkeeper) must all be updated.

### LiveSync E2E Encryption

Not currently configured. Obsidian's Self-hosted LiveSync plugin supports end-to-end encryption where note content is encrypted in the browser before being sent to CouchDB. Enabling this would make server-side full-text search and the web app editor impossible. It is recommended for high-security deployments where the server operator should not be able to read note contents.

---

## 6. Database Schema

### Note Parent Document

Every note has a parent document that acts as the index entry.

```json
{
  "_id": "My Note.md",
  "_rev": "3-abc123...",
  "path": "My Note.md",
  "type": "plain",
  "title": "My Note",
  "mtime": 1748980000000,
  "children": ["My Note.md_c0"]
}
```

| Field | Type | Description |
|---|---|---|
| `_id` | string | Filename with `.md` extension (e.g. `My Note.md`, `Projects/Report.md`) |
| `_rev` | string | CouchDB revision (managed by CouchDB) |
| `path` | string | Same as `_id` — full path including folders |
| `type` | string | Always `"plain"` for standard notes |
| `title` | string | Display title (filename without `.md` extension) |
| `mtime` | number | Unix timestamp in milliseconds — last modified time |
| `children` | string[] | Array of chunk document IDs (always `["<id>_c0"]` for app-created notes) |

### Note Chunk Document

Content is stored in a separate chunk document, allowing large notes to be split.

```json
{
  "_id": "My Note.md_c0",
  "_rev": "2-def456...",
  "data": "# My Note\n\nNote content in Markdown..."
}
```

| Field | Type | Description |
|---|---|---|
| `_id` | string | Parent ID + `_c0` suffix (e.g. `My Note.md_c0`) |
| `_rev` | string | CouchDB revision |
| `data` | string | Full Markdown content of the note |

**Chunk naming convention:** `<parent._id>_c<index>` where index starts at 0. The app currently always creates exactly one chunk (`_c0`). Multi-chunk notes (from Obsidian LiveSync) may have `_c0`, `_c1`, etc.

### Chunk Reassembly

When reading a note (`assembleNoteContent()` in `lib/couchdb.ts`):

1. Fetch the parent document
2. Read `parent.children` array: `["My Note.md_c0", "My Note.md_c1", ...]`
3. If `children.length === 0`: content is in `parent.body` or `parent.content` directly
4. Otherwise: fetch each chunk document in order, extract `chunk.data`
5. Concatenate all chunk `data` values in order → full note content
6. Strip YAML frontmatter if present (`stripFrontmatter()`)

### CouchDB `_security` Document

Every vault has a `_security` document at `/<vaultName>/_security`:

**Personal vault:**
```json
{
  "admins": { "names": ["admin"], "roles": ["_admin"] },
  "members": { "names": [], "roles": [] }
}
```

**Personal vault with LiveSync credentials provisioned:**
```json
{
  "admins": { "names": ["admin"], "roles": ["_admin"] },
  "members": { "names": ["957e5bcc-eb3f-442d-b5ec-0f47cac3282c"], "roles": [] }
}
```

**Shared vault (synced from Keto):**
```json
{
  "admins": { "names": ["admin"], "roles": ["_admin"] },
  "members": { "names": ["user-id-1", "user-id-2", "user-id-3"], "roles": [] }
}
```

### CouchDB `_users` Document (LiveSync Credentials)

Document ID: `org.couchdb.user:<userId>`

```json
{
  "_id": "org.couchdb.user:957e5bcc-eb3f-442d-b5ec-0f47cac3282c",
  "_rev": "1-xxx",
  "name": "957e5bcc-eb3f-442d-b5ec-0f47cac3282c",
  "password": "a3f8...",
  "roles": [],
  "type": "user",
  "livesync_password": "a3f8b2c1d4e5f6a7b8c9d0e1f2a3b4c5"
}
```

| Field | Notes |
|---|---|
| `_id` | `org.couchdb.user:` prefix + Kratos identity UUID |
| `name` | Kratos identity UUID (used as CouchDB username for LiveSync) |
| `password` | Plaintext on write — CouchDB immediately hashes this with bcrypt and removes it |
| `livesync_password` | Plaintext — stored in addition to `password` so the app can retrieve and display it |
| `roles` | Empty array — no special CouchDB roles |
| `type` | Always `"user"` |

### Database Naming Conventions

| Pattern | Example | Owner |
|---|---|---|
| `obsidian` | `obsidian` | Admin user (ADMIN_USER_ID) |
| `vault-<userId>` | `vault-957e5bcc-eb3f-442d-b5ec-0f47cac3282c` | Regular user |
| `vault-shared-<16 hex chars>` | `vault-shared-a1b2c3d4e5f6a7b8` | Shared (Keto-governed) |
| `_users` | `_users` | CouchDB system — stores LiveSync credentials |

### Shared Vault Metadata Document

Each shared vault contains a `rexform-metadata` document:

```json
{
  "_id": "rexform-metadata",
  "vaultName": "Team Research",
  "createdBy": "957e5bcc-eb3f-442d-b5ec-0f47cac3282c",
  "createdAt": 1748980000000
}
```

### `isVaultNote` Filter

Notes are filtered by `isVaultNote()` in `lib/couchdb.ts` before being returned to the UI. A document is a valid note if:

- Not deleted (`_deleted !== true`)
- `_id` does not start with `docs/`, `node_modules/`, `h:`, or `_`
- `_id` is not `rexform-metadata`
- `doc.type === 'plain'` OR `doc.path` ends with `.md`

---

## 7. API Reference

### `GET/POST /api/auth/[...nextauth]`

NextAuth.js handler. Manages session creation, JWT signing, and session retrieval.

| | |
|---|---|
| Auth required | No (handles auth itself) |
| Key endpoints | `POST /api/auth/callback/credentials` — submit login credentials |
| | `GET /api/auth/session` — return current session |
| | `POST /api/auth/signout` — clear session cookie |

---

### `GET /api/notes`

List notes in the active vault with pagination.

| | |
|---|---|
| Auth required | Yes (JWT session) |
| Query params | `page` (default 1), `limit` (default 20, max 100), `vault` (optional vault name) |
| Response | `{ rows, total, page, totalPages, hasNext, hasPrev, limit }` |
| Filtering | Applies `isVaultNote()` — `.md` files only, excludes `node_modules/`, `docs/`, `h:`, `_` prefixed docs |
| Sorting | By `mtime` descending |
| Error codes | 401 (no session) |

---

### `POST /api/notes/create`

Create a new note in the active vault.

| | |
|---|---|
| Auth required | Yes (JWT session) |
| Query params | `vault` (optional) |
| Request body | `{ title: string, content: string }` |
| Response | `201 { id, title, path }` |
| Document format | Creates parent doc `<title>.md` + chunk doc `<title>.md_c0` |
| Error codes | 401 (no session), 400 (missing title or invalid body), 403 (read-only vault), 500 (CouchDB error) |

---

### `GET /api/notes/[id]`

Fetch a single note document (parent doc only, not assembled content).

| | |
|---|---|
| Auth required | Yes (JWT session) |
| Path param | `id` — URL-encoded note `_id` |
| Query params | `vault` (optional) |
| Response | Raw CouchDB document (parent doc) |
| Error codes | 401, 500 |

---

### `PUT /api/notes/[id]/update`

Update note content. Handles both single-doc and chunked notes.

| | |
|---|---|
| Auth required | Yes (JWT session) |
| Path param | `id` — URL-encoded note `_id` |
| Query params | `vault` (optional) |
| Request body | `{ content: string }` |
| Response | `{ success: true }` |
| Behaviour | If `children.length > 0`: updates first chunk (`children[0]`) + updates parent `mtime`. If no children: updates `body` on parent doc directly. |
| Error codes | 401, 400, 403 (read-only vault), 404 (note or chunk not found), 500 |

---

### `DELETE /api/notes/[id]/delete`

Delete a note and all its chunk documents.

| | |
|---|---|
| Auth required | Yes (JWT session) |
| Path param | `id` — URL-encoded note `_id` |
| Query params | `vault` (optional) |
| Response | `{ success: true }` |
| Behaviour | Fetches note, deletes all chunk docs in parallel, then deletes parent doc |
| Error codes | 401, 403 (read-only vault), 404, 500 |

---

### `GET /api/search`

Full-text search across note titles and paths (not content).

| | |
|---|---|
| Auth required | Yes (JWT session) |
| Query params | `q` (search string), `vault` (optional) |
| Response | `{ results: [{ _id, title, snippet }] }` — max 50 results |
| Behaviour | Fetches all notes, filters by `isPageDoc()`, searches `path` and `title` fields. Does not search note body content. |

---

### `GET /api/vaults`

List all vaults accessible to the current user.

| | |
|---|---|
| Auth required | Yes (JWT session) |
| Response | `{ vaults: [{ name, label, role? }], activeVault: string }` |
| Behaviour | Returns personal vault + any shared vaults from Keto. `role` is included for shared vaults (`owner`/`editor`/`viewer`). Personal vault has no role field (always owner). |

---

### `POST /api/vaults`

Switch the active vault.

| | |
|---|---|
| Auth required | Yes (JWT session) |
| Request body | `{ vault: string }` — vault database name |
| Response | `{ activeVault: string }` |
| Behaviour | Validates vault is accessible to user, sets `rexform-active-vault` httpOnly cookie |
| Error codes | 401, 400, 403 (vault not accessible) |

---

### `GET /api/user/credentials`

Get LiveSync credentials for the current user.

| | |
|---|---|
| Auth required | Yes (JWT session) |
| Response | `{ username, password, serverUrl, database }` |
| Behaviour | Reads `_users` doc. If not found, auto-provisions. Also triggers `configureCouchDbCors()` idempotently. Admin users get 400 (use obsidian vault directly). |

---

### `POST /api/user/credentials`

Regenerate LiveSync credentials (new random password).

| | |
|---|---|
| Auth required | Yes (JWT session) |
| Response | `{ username, password, serverUrl, database }` |
| Behaviour | Generates new 32-char hex password, updates `_users` doc, re-confirms `_security` vault access |
| Error codes | 401, 400 (admin user), 500 |

---

### `GET /api/admin/users`

List all registered users with vault info.

| | |
|---|---|
| Auth required | Yes — admin only (`isAdminUser` check) |
| Query params | `page` (default 1), `limit` (default 20, max 100) |
| Response | `{ users: [{ id, email, createdAt, state, isAdmin, vault }], total, page, totalPages }` |
| Behaviour | Lists up to 500 identities from Kratos, enriches each with CouchDB vault info. Admin user sorted first, then by `createdAt` descending. |
| `vault` shape | `{ exists, docCount, dbName, sizeBytes }` |

---

### `PATCH /api/admin/users/[id]/state`

Suspend or reactivate a user account.

| | |
|---|---|
| Auth required | Yes — admin only |
| Path param | `id` — Kratos identity UUID |
| Request body | `{ state: "active" | "inactive" }` |
| Response | `{ success: true, state }` |
| Behaviour | Calls Kratos `patchIdentity` to set the identity state. Admin cannot change their own state. |

---

### `DELETE /api/admin/users/[id]/vault`

Fully delete a user (Kratos identity + CouchDB vault + credentials).

| | |
|---|---|
| Auth required | Yes — admin only |
| Path param | `id` — Kratos identity UUID |
| Response | `{ success: boolean, results: { kratos, vault, credentials } }` |
| Behaviour | (1) Delete Kratos identity. (2) DELETE `/vault-<userId>` in CouchDB. (3) Delete `org.couchdb.user:<userId>` from `_users`. All steps attempted independently; partial failures reported. |
| Protections | Cannot delete admin account |

---

### `DELETE /api/admin/users/[id]/vault-db`

Delete only the CouchDB vault and credentials (Kratos identity preserved).

| | |
|---|---|
| Auth required | Yes — admin only |
| Path param | `id` — Kratos identity UUID |
| Response | `{ success: boolean, results: { vault, credentials } }` |
| Use case | Re-provision a user's vault without deleting their account |

---

### `POST /api/admin/users/[id]/provision`

Create a missing vault for an existing user.

| | |
|---|---|
| Auth required | Yes — admin only |
| Response | `{ success: true, vaultName }` |
| Behaviour | Calls `createUserVault(userId)` — creates CouchDB DB, sets `_security`, seeds starter notes, provisions LiveSync credentials |

---

### `GET /api/admin/vaults`

List all shared vaults.

| | |
|---|---|
| Auth required | Yes — admin only |
| Response | `{ vaults: [{ vaultId, vaultName, createdBy, createdAt, docCount, sizeBytes }] }` |
| Behaviour | Lists all CouchDB databases starting with `vault-shared-`, fetches `rexform-metadata` and DB info for each |

---

### `POST /api/admin/vaults`

Create a new shared vault.

| | |
|---|---|
| Auth required | Yes — admin only |
| Request body | `{ name: string }` |
| Response | `201 { vaultId, vaultName }` |
| Behaviour | Calls `createSharedVault(name, creatorId)`: creates CouchDB DB, sets `_security`, seeds starter notes, stores metadata doc, grants creator `owner` role in Keto, syncs `_security` |

---

### `DELETE /api/admin/vaults/[vaultId]`

Delete a shared vault.

| | |
|---|---|
| Auth required | Yes — admin only |
| Path param | `vaultId` — must start with `vault-shared-` |
| Response | `{ success: boolean, results: { keto, couchdb } }` |
| Behaviour | Revokes all Keto relation tuples for the vault, then DELETE the CouchDB database |

---

### `GET /api/admin/vaults/[vaultId]/members`

List members of a shared vault with email enrichment.

| | |
|---|---|
| Auth required | Yes — admin only |
| Response | `{ members: [{ userId, role, email }] }` |
| Behaviour | Fetches Keto tuples for the vault, resolves each `userId` to an email via `kratosAdmin.getIdentity()`. `email` is `null` if identity not found. |

---

### `POST /api/admin/vaults/[vaultId]/members`

Add a member to a shared vault (or change their role).

| | |
|---|---|
| Auth required | Yes — admin only |
| Request body | `{ userId: string, role: "owner" | "editor" | "viewer" }` |
| Response | `{ success: true }` |
| Behaviour | Revokes any existing role for this user first (prevents duplicate tuples), grants new role in Keto, calls `syncVaultSecurity()` to update CouchDB `_security` |

---

### `PATCH /api/admin/vaults/[vaultId]/members/[userId]`

Change a member's role.

| | |
|---|---|
| Auth required | Yes — admin only |
| Request body | `{ role: "owner" | "editor" | "viewer" }` |
| Response | `{ success: true }` |
| Behaviour | Revokes all existing roles for user, grants new role, syncs `_security` |

---

### `DELETE /api/admin/vaults/[vaultId]/members/[userId]`

Remove a member from a shared vault.

| | |
|---|---|
| Auth required | Yes — admin only |
| Response | `{ success: true }` |
| Protections | Cannot remove the last owner |
| Behaviour | Revokes all Keto tuples for this user on this vault, syncs `_security` |

---

### `POST /api/hooks/kratos/after-register`

Kratos after-registration webhook.

| | |
|---|---|
| Auth required | No (called by Kratos, must be publicly accessible) |
| Request body | `{ identity: { id, traits: { email } } }` (Jsonnet-transformed by Kratos) |
| Response | Always `200 { status: "ok", vaultCreated: boolean }` |
| Behaviour | Calls `createUserVault(identityId)`. Never returns non-200 — Kratos requires 200 to complete registration. |

---

## 8. Vault Management

### Personal Vault Creation

Triggered automatically by the Kratos after-registration webhook. Can also be triggered manually via `POST /api/admin/users/[id]/provision`.

**Steps in `createUserVault(userId)` (`lib/vault.ts`):**

1. `PUT /vault-<userId>` — create CouchDB database (412 = already exists, treated as success)
2. `PUT /vault-<userId>/_security` — lock to admin only (`members.names = []`)
3. Seed 3 starter notes (parent + chunk docs for each):
   - `Welcome to REXFORM Notes.md`
   - `Quick Start Guide.md`
   - `My First Note.md`
4. Call `provisionUserCredentials(userId)` — create `_users` doc with generated password, update `_security.members.names = [userId]`

### Shared Vault Creation

Admin-only via `POST /api/admin/vaults`. Steps in `createSharedVault(name, creatorUserId)` (`lib/vault.ts`):

1. Generate `vaultId = vault-shared-<16 random hex chars>`
2. `PUT /vault-shared-<hex>` — create CouchDB database
3. `PUT /_security` — lock to admin only initially
4. `PUT /rexform-metadata` — store `{ vaultName, createdBy, createdAt }`
5. Seed 3 starter notes
6. `grantVaultAccess(vaultId, creatorUserId, 'owner')` — Keto write
7. `syncVaultSecurity(vaultId)` — update CouchDB `_security.members.names` from Keto

### Starter Notes

Three notes are seeded into every new vault (personal and shared). Each is stored as a parent + chunk pair:

| Title | `_id` | Chunk `_id` |
|---|---|---|
| Welcome to REXFORM Notes | `Welcome to REXFORM Notes.md` | `Welcome to REXFORM Notes.md_c0` |
| Quick Start Guide | `Quick Start Guide.md` | `Quick Start Guide.md_c0` |
| My First Note | `My First Note.md` | `My First Note.md_c0` |

Content is defined in `lib/starter-notes.ts`.

### Per-User CouchDB Credential Provisioning

Steps in `provisionUserCredentials(userId)` (`lib/couchdb-credentials.ts`):

1. `ensureUsersDb()` — `PUT /_users` (creates if missing, 412 = already exists)
2. `configureCouchDbCors()` — idempotent CORS configuration (5 PUT requests to `/_node/nonode@nohost/_config/...`)
3. Generate a 32-char hex password via `crypto.randomBytes(16).toString('hex')`
4. If user exists in `_users`: fetch `_rev` for update
5. `PUT /_users/org.couchdb.user:<userId>` with `{ name, password, roles: [], type: 'user', livesync_password: password }`
6. `ensureVaultAccess(userId)` — `PUT /vault-<userId>/_security` with `members.names = [userId]`

### `syncVaultSecurity(vaultId)` 

Called after every Keto membership change to keep CouchDB `_security` in sync:

1. Call `getVaultMembers(vaultId)` — reads all relation tuples from Keto Read API
2. Deduplicate userIds via `Array.from(new Set(...))`
3. `PUT /<vaultId>/_security` with `members.names = [all member userIds]`

This ensures LiveSync works for all current members.

### Vault Deletion

**Full user delete** (`DELETE /api/admin/users/[id]/vault`):
1. Delete Kratos identity via Admin API
2. `DELETE /vault-<userId>` in CouchDB
3. `DELETE /_users/org.couchdb.user:<userId>` (fetches rev first)

**Vault-only delete** (`DELETE /api/admin/users/[id]/vault-db`):
1. `DELETE /vault-<userId>` in CouchDB
2. `DELETE /_users/org.couchdb.user:<userId>` (credentials only)
3. Kratos identity preserved — user can be re-provisioned

**Shared vault delete** (`DELETE /api/admin/vaults/[vaultId]`):
1. `getVaultMembers(vaultId)` — list all Keto tuples
2. Revoke all tuples in parallel
3. `DELETE /<vaultId>` in CouchDB

---

## 9. Permission Model

### Keto Namespace Structure

```
Namespace: vault

Object:    vault-shared-<hex>    (CouchDB database name)
Relations: owner | editor | viewer
Subject:   <userId>              (Kratos identity UUID)

Example tuples:
  vault:vault-shared-abc123#owner@user-uuid-1
  vault:vault-shared-abc123#editor@user-uuid-2
  vault:vault-shared-abc123#viewer@user-uuid-3
```

### Role Capabilities

| Action | owner | editor | viewer | Notes |
|---|---|---|---|---|
| Read notes (GET) | ✓ | ✓ | ✓ | All roles can read |
| Create notes (POST) | ✓ | ✓ | ✗ | `canWrite=false` → 403 |
| Update notes (PUT) | ✓ | ✓ | ✗ | `canWrite=false` → 403 |
| Delete notes (DELETE) | ✓ | ✓ | ✗ | `canWrite=false` → 403 |
| Switch to vault | ✓ | ✓ | ✓ | Validated in `POST /api/vaults` |
| LiveSync direct access | ✓ | ✓ | ✓ | `_security.members.names` includes all |
| Manage members | — | — | — | Admin panel only |

### How Permissions Are Checked in API Routes

Every note API route calls `resolveVault(session, vaultParam?)` from `lib/active-vault.ts`:

```typescript
// For personal vaults: always canWrite=true, no Keto call
if (isPersonalVault(session, vaultParam)) {
  return { db: vaultParam, canWrite: true };
}

// For shared vaults: 3 sequential Keto checks
const isOwner  = await checkVaultAccess(vaultId, userId, 'owner');
const isEditor = !isOwner && await checkVaultAccess(vaultId, userId, 'editor');
const isViewer = !isOwner && !isEditor && await checkVaultAccess(vaultId, userId, 'viewer');
// canWrite = isOwner || isEditor
```

`checkVaultAccess()` calls `GET /relation-tuples/check` on the Keto Read API (port 4466).

### Admin Bypass

`isAdminUser(userId)` in `lib/vault.ts` checks `userId === process.env.ADMIN_USER_ID`. When true:
- User is routed to the `obsidian` vault regardless of cookies or params
- Admin panel access is granted (`isAdmin: true` in JWT)
- Admin cannot be deleted, suspended, or have their vault deleted via the admin panel

### CouchDB `_security` Sync

Keto is the authoritative permission store. CouchDB `_security` is kept in sync via `syncVaultSecurity()` which is called after every Keto membership mutation:
- `POST /api/admin/vaults/[vaultId]/members` (add member)
- `PATCH /api/admin/vaults/[vaultId]/members/[userId]` (change role)
- `DELETE /api/admin/vaults/[vaultId]/members/[userId]` (remove member)
- `createSharedVault()` (on vault creation)

If `_security` and Keto drift out of sync, the Next.js API layer still enforces Keto (reads go through `resolveVault`), but LiveSync (direct CouchDB) would reflect the `_security` state only.

---

## 10. Environment Variables Reference

### rexform-notes

| Variable | Required | Description | Example |
|---|---|---|---|
| `NEXTAUTH_URL` | ✓ | Full public URL of the Next.js app | `https://rexform-notes-production.up.railway.app` |
| `NEXTAUTH_SECRET` | ✓ | Secret for JWT signing and encryption (min 32 chars) | `openssl rand -base64 32` |
| `NEXT_PUBLIC_KRATOS_PUBLIC_URL` | ✓ | Kratos public API URL (browser-accessible) | `https://rexform-kratos-production.up.railway.app` |
| `KRATOS_ADMIN_URL` | ✓ | Kratos admin API URL (server-side only) | `http://kratos.railway.internal:4434` |
| `COUCHDB_URL` | ✓ | CouchDB public URL (used for admin ops — internal URL rejects auth) | `https://couch-db-production.up.railway.app` |
| `COUCHDB_USERNAME` | ✓ | CouchDB admin username | `admin` |
| `COUCHDB_PASSWORD` | ✓ | CouchDB admin password | `<rotated secret>` |
| `COUCHDB_DATABASE` | Optional | Default database name | `obsidian` |
| `COUCHDB_PROXY_URL` | Optional | Oathkeeper proxy URL for reads on admin vault. Unset = direct auth (local dev) | `https://oathkeeper-production-316a.up.railway.app` |
| `COUCHDB_INTERNAL_URL` | Optional | Railway internal URL (not used — kept for reference) | `http://couch-db.railway.internal:5984` |
| `COUCHDB_ADMIN_USER` | Optional | Falls back to `COUCHDB_USERNAME` | `admin` |
| `COUCHDB_ADMIN_PASSWORD` | Optional | Falls back to `COUCHDB_PASSWORD` | `<rotated secret>` |
| `ADMIN_USER_ID` | ✓ | Kratos identity UUID of the admin account | `957e5bcc-eb3f-442d-b5ec-0f47cac3282c` |
| `KETO_READ_URL` | Optional | Keto Read API URL. Unset = shared vault permissions disabled | `http://rexform-keto.railway.internal:4466` |
| `KETO_WRITE_URL` | Optional | Keto Write API URL | `http://rexform-keto.railway.internal:4467` |

### rexform-kratos

| Variable | Required | Description |
|---|---|---|
| `DSN` | ✓ | PostgreSQL connection string for Kratos data |
| `SECRETS_DEFAULT` | ✓ | Kratos encryption secret (min 16 chars) |
| `SECRETS_COOKIE` | ✓ | Cookie encryption secret |

### rexform-keto

| Variable | Required | Description |
|---|---|---|
| `DSN` | ✓ | Set as `${{Postgres.DATABASE_URL}}` (Railway cross-service var) |
| `KETO_DATABASE_URL` | ✓ | Same as DSN — referenced in `keto.yml` |

### oathkeeper

| Variable | Required | Description |
|---|---|---|
| `COUCHDB_ADMIN_URL` | ✓ | `http://admin:<password>@couch-db.railway.internal:5984` |
| `KRATOS_PUBLIC_URL` | ✓ | Kratos public URL for session validation |
| `OATHKEEPER_PUBLIC_URL` | Optional | Used if id_token mutator is enabled |
| `NEXTJS_URL` | Optional | Next.js URL for browser redirect on auth failure |

### couch-db

| Variable | Required | Description |
|---|---|---|
| `COUCHDB_USER` | ✓ | Admin username |
| `COUCHDB_PASSWORD` | ✓ | Admin password |

### obsidian-remote

| Variable | Required | Description |
|---|---|---|
| `PUID` | ✓ | User ID for container (typically `1000`) |
| `PGID` | ✓ | Group ID for container (typically `1000`) |
| `TZ` | Optional | Timezone (e.g. `Asia/Phnom_Penh`) |
| `CUSTOM_USER` | ✓ | Username for KasmVNC access |
| `PASSWORD` | ✓ | Password for KasmVNC access |

---

## 11. Deployment Guide

### Service Deployment Order

Services must be deployed in dependency order:

```
1. kratos-postgres    ← no dependencies
2. Postgres (keto)    ← no dependencies
3. couch-db           ← no dependencies
4. rexform-kratos     ← needs kratos-postgres (DSN)
5. rexform-keto       ← needs Postgres (DSN), runs migrate up on start
6. oathkeeper         ← needs couch-db (upstream) and rexform-kratos (session check)
7. rexform-notes      ← needs all of the above
8. obsidian-remote    ← independent, can deploy any time
```

### Step-by-Step Railway Deployment

**1. Deploy `kratos-postgres` and `Postgres` (keto)**
- Use Railway's managed PostgreSQL
- Both will auto-expose `DATABASE_URL`

**2. Deploy `couch-db`**
- Image: `couchdb:3`
- Add volume at `/opt/couchdb/data`
- Set `COUCHDB_USER` and `COUCHDB_PASSWORD`
- Initialize the cluster (run once after first deploy):
  ```bash
  curl -X POST https://couch-db-production.up.railway.app/_cluster_setup \
    -u admin:PASSWORD \
    -H "Content-Type: application/json" \
    -d '{"action":"enable_single_node","bind_address":"0.0.0.0","port":5984}'
  ```

**3. Deploy `rexform-kratos`**
- Use Dockerfile in `kratos/`
- Set `DSN` to the kratos-postgres connection string
- Set `SECRETS_DEFAULT` and `SECRETS_COOKIE`
- The after-registration webhook URL in `kratos.yml` must point to the live `rexform-notes` URL — update before deploying if changed

**4. Deploy `rexform-keto`**
- Use Dockerfile in `keto/`
- Set `DSN = ${{Postgres.DATABASE_URL}}` (Railway cross-service variable)
- Set `KETO_DATABASE_URL = ${{Postgres.DATABASE_URL}}`
- Migration runs automatically on container start (`echo y | keto migrate up`)
- Verify health: `GET https://keto-production.up.railway.app/health/ready`

**5. Deploy `oathkeeper`**
- Use Dockerfile in `oathkeeper/`
- Set `COUCHDB_ADMIN_URL = http://admin:PASSWORD@couch-db.railway.internal:5984`
- Set `KRATOS_PUBLIC_URL = https://rexform-kratos-production.up.railway.app`
- Verify: `GET https://oathkeeper-production.up.railway.app/_up` should return `{}`

**6. Deploy `rexform-notes`**
- Use Dockerfile or Railway Nixpack auto-detect in `app/`
- Set all environment variables listed in Section 10
- Verify admin user ID: after first login with the admin account, find the identity ID via:
  ```bash
  curl -s https://rexform-kratos-production.up.railway.app/admin/identities \
    -u admin:KRATOS_ADMIN_KEY | jq '.[].id'
  ```
  Set this as `ADMIN_USER_ID`
- Deploy command: `railway up --service ddde10ba-fef1-4318-90ee-d79485f3ff0e --detach`

**7. Deploy `obsidian-remote`**
- Image: `lscr.io/linuxserver/obsidian:latest`
- Add volume at `/config`
- Set port to `3001`

### Health Checks

| Service | Health endpoint |
|---|---|
| couch-db | `GET /couch-db-production.up.railway.app/_up` → `{}` |
| rexform-kratos | `GET /rexform-kratos-production.up.railway.app/health/ready` |
| oathkeeper | `GET /oathkeeper-production.up.railway.app/_up` → `{}` |
| rexform-keto | `GET /:4466/health/ready` and `GET /:4467/health/ready` |
| rexform-notes | `GET /rexform-notes-production.up.railway.app/api/auth/session` |

### Common Deployment Issues

| Issue | Cause | Fix |
|---|---|---|
| CouchDB admin ops return 401 | Using internal Railway hostname | Use public URL (`COUCHDB_URL`) for admin operations |
| Keto `migrate up` prompt hangs | v0.11 has no `--yes` flag | Use `echo y \| keto migrate up` in Dockerfile CMD |
| Cross-service env vars empty in Keto | `${{kratos-postgres.POSTGRES_USER}}` in compound string fails | Use Railway managed Postgres and reference `${{Postgres.DATABASE_URL}}` as a single value |
| Oathkeeper reads return 401 | Kratos session token expired | This is expected for stale sessions. Writes already bypass Oathkeeper. |
| After-register webhook fails | `rexform-notes` not deployed yet | Deploy order matters — Kratos webhook must reach `rexform-notes` |
| `_users` db missing | CouchDB 3.x does not auto-create | `ensureUsersDb()` handles this automatically on first credential provision |
| Keto member list empty | Using Write URL for reads | Use Read URL (port 4466) for `GET /relation-tuples` |

---

## 12. Known Limitations & Future Work

### Current Limitations

| Limitation | Details |
|---|---|
| Email verification not enforced | Kratos verification flow is configured but users are not blocked from using the app until they verify. `courier.smtp` points to a placeholder SMTP server. |
| SMTP not production-configured | Password recovery and email verification emails will not send in production until a real SMTP provider (e.g. SendGrid, Postmark) is configured in `kratos.yml`. |
| `obsidian-remote` is single-user | The linuxserver/obsidian image provides one KasmVNC session. Multiple users cannot have separate browser Obsidian instances. This is admin-only tooling. |
| Kratos session token not refreshed | `kratosSessionToken` in the NextAuth JWT is not refreshed when it expires. Long-lived sessions may cause Oathkeeper read failures for the admin vault. Writes are unaffected. |
| Note search is title/path only | `/api/search` searches `path` and `title` fields. Note body content is not indexed. Full-text search would require a CouchDB view or external index. |
| Admin user is hardcoded by UUID | `ADMIN_USER_ID` is a single UUID. There is no multi-admin role system — only one user is the admin. |
| LiveSync E2E encryption disabled | Notes are stored in plaintext in CouchDB. Enabling Obsidian LiveSync's E2E encryption would break the web editor and server-side search. |
| Shared vault notes not per-note permissioned | Permission granularity is at the vault level (all notes in a vault share the same role). Per-note ACLs are not implemented. |
| No rate limiting | API routes have no rate limiting. A malicious authenticated user could hammer the CouchDB proxy. |
| Keto is not highly available | Single Keto instance. If it goes down, shared vault permission checks fail gracefully (fallback to active vault cookie) but membership changes fail. |

### Phase 6 Planned Work

- **Per-user `obsidian-remote`**: Launch a separate `linuxserver/obsidian` container per user on Railway, each mounted to the user's vault. Currently blocked by the complexity of dynamic Railway service provisioning.
- **Production SMTP**: Connect Kratos courier to a real email provider to enable email verification and password recovery.
- **Full-text note search**: Index note body content, either via a CouchDB Mango index or an external service.
- **Multi-admin support**: Replace the single `ADMIN_USER_ID` with a Keto-backed `admin` role.

### Security Considerations for Production Hardening

1. **Rotate all secrets** — `NEXTAUTH_SECRET`, `COUCHDB_ADMIN_PASSWORD`, `SECRETS_DEFAULT`, `SECRETS_COOKIE` should all be unique, randomly generated values
2. **Enable email verification** — configure a real SMTP provider and enforce verification before vault access
3. **Add rate limiting** — implement rate limiting on `/api/auth/*` and note write routes
4. **Enable LiveSync E2E encryption** — if note confidentiality is required, accept the trade-off (no web editor)
5. **Restrict Keto and Kratos admin ports** — ensure ports 4434 (Kratos admin) and 4467 (Keto write) are not publicly accessible
6. **CouchDB `_users` password visibility** — consider whether storing `livesync_password` in plaintext in the `_users` document is acceptable for your threat model
