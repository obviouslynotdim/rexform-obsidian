# Architecture

## Request Flow

Full lifecycle from browser to CouchDB for a note API call.

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

---

## Authentication Flow

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

---

## Vault Isolation

How different users are routed to different CouchDB databases.

```mermaid
flowchart TD
    UA[User A\nid: abc-123] -->|getUserVaultName| VA[(vault-abc-123)]
    UB[User B\nid: def-456] -->|getUserVaultName| VB[(vault-def-456)]
    ADM[Admin User\nADMIN_USER_ID match] -->|getAdminVaultName| VO[(obsidian)]
    UC[User C] -->|Keto: owner| VS[(vault-shared-xyz789)]
    UD[User D] -->|Keto: editor| VS
    UE[User E] -->|Keto: viewer\ncanWrite=false| VS

    VA -->|_security.members=[abc-123]| CDB[(CouchDB)]
    VB -->|_security.members=[def-456]| CDB
    VO -->|_security.admins=[admin]| CDB
    VS -->|_security.members=[userC,userD,userE]| CDB
```

---

## Note Creation Flow

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

    Note over A: id = "My Note.md", chunkId = "My Note.md_c0"

    A->>FV: PUT "My Note.md_c0" { _id, data: content }
    FV->>DB: PUT /vault-abc-123/My%20Note.md_c0 (admin creds)
    DB-->>FV: { ok: true, rev: "1-xxx" }

    A->>FV: PUT "My Note.md" { _id, path, type, title, mtime, children: ["My Note.md_c0"] }
    FV->>DB: PUT /vault-abc-123/My%20Note.md (admin creds)
    DB-->>FV: { ok: true, rev: "1-yyy" }

    A-->>E: 201 { id: "My Note.md", title, path }
    E->>E: router.push("/notes/My%20Note.md")
```

---

## Permission Check Flow

How Keto permissions are evaluated for shared vault access.

```mermaid
flowchart TD
    REQ[Incoming API Request] --> GS[getServerSession]
    GS --> TK{Valid JWT token?}
    TK -->|No| E401[401 Unauthorized]
    TK -->|Yes| RV[resolveVault session, vaultParam]

    RV --> VP{vaultParam provided?}
    VP -->|No| CV[getActiveVault\nread rexform-active-vault cookie]
    CV --> RET1[return db=activeVault, canWrite=true]

    VP -->|Yes| PV{isPersonalVault?}
    PV -->|Yes — matches vault-userId| RET2[return db=vaultParam, canWrite=true]

    PV -->|No — vault-shared-*| KETO[checkVaultAccess × 3\nKeto GET /relation-tuples/check]
    KETO --> KR{Role found?}
    KR -->|owner| RET3[canWrite=true]
    KR -->|editor| RET4[canWrite=true]
    KR -->|viewer| RET5[canWrite=false]
    KR -->|none / Keto error| FB[fallback: getActiveVault]

    RET1 --> EXEC[Execute CouchDB operation\nfetchFromVault admin creds]
    RET2 --> EXEC
    RET3 --> EXEC
    RET4 --> EXEC
    RET5 --> CW{canWrite required?}
    CW -->|write route| E403[403 Read-only access]
    CW -->|read route| EXEC
    FB --> EXEC
```

---

## Data Flows

### Registration

```
User registers
  → Kratos creates identity in kratos-postgres
  → Kratos fires webhook → rexform-notes /api/hooks/kratos/after-register
      → createUserVault(userId)
          → CouchDB: PUT /vault-<userId>           create DB
          → CouchDB: PUT /vault-<userId>/_security  lock to admin only
          → CouchDB: seed 3 starter notes
          → CouchDB: PUT /_users/org.couchdb.user:<userId>  LiveSync credentials
          → CouchDB: configure CORS (idempotent)
```

### Login & Note Access

```
User logs in
  → NextAuth ← Kratos credentials flow
  → kratosSessionToken stored in encrypted JWT cookie

User opens notes
  → GET /api/notes?page=1&limit=20
      → resolveVault(session)  reads rexform-active-vault cookie
      → fetchFromVault(_all_docs, admin creds, vault-<userId>)
      → filter to .md files only (isVaultNote), sort by mtime, paginate
```

### Shared Vault Access

```
Admin creates shared vault
  → POST /api/admin/vaults
      → createSharedVault(name, creatorId) in CouchDB
      → grantVaultAccess(vaultId, creatorId, 'owner') in Keto
      → syncVaultSecurity(vaultId) → CouchDB _security.members.names updated

Admin adds member
  → POST /api/admin/vaults/[vaultId]/members
      → revoke existing role (if any) in Keto
      → grant new role in Keto
      → syncVaultSecurity(vaultId) → CouchDB _security updated

Member accesses shared vault
  → resolveVault(session, 'vault-shared-xxx')
      → checkVaultAccess(vaultId, userId, role) via Keto Read API
      → returns { db: 'vault-shared-xxx', canWrite: true/false }
  → fetchFromVault(path, admin creds, vault-shared-xxx)
```

### Obsidian LiveSync

```
User opens Settings → copies Server URL, Database, Username, Password
  (these are the CouchDB _users credentials, not the admin password)

Obsidian LiveSync plugin connects:
  → HTTPS → couch-db-production.up.railway.app
  → Authenticates as userId (not admin)
  → CouchDB _security.members.names allows this user into vault-<userId>
  → Bidirectional sync: local vault ↔ CouchDB vault-<userId>
```

---

## Key Architectural Decisions

| Decision | Reason |
|---|---|
| Writes bypass Oathkeeper | Kratos session tokens expire; stale tokens cause silent 401s on saves |
| Public CouchDB URL for admin ops | Railway internal hostname silently drops Basic auth headers |
| Keto Read API (port 4466) for member lists | Write API (port 4467) returns empty results for list queries |
| `echo y \| keto migrate up` in Dockerfile | Keto v0.11 has no `--yes` flag; prompts interactively otherwise |
| `syncVaultSecurity()` on every Keto change | LiveSync needs `_security.members.names` in sync with Keto tuples |
| Admin credentials for all server-side CouchDB calls | Consistent, never expire; auth already enforced at Next.js API layer |
