# Vault Management

## Personal Vault Creation

Triggered automatically by the Kratos after-registration webhook (`/api/hooks/kratos/after-register`). Can also be triggered manually by an admin via `POST /api/admin/users/[id]/provision`.

**Steps in `createUserVault(userId)` — `lib/vault.ts`:**

1. `PUT /vault-<userId>` — create CouchDB database (412 = already exists, treated as success)
2. `PUT /vault-<userId>/_security` — lock to admin only (`members.names = []`)
3. Seed 3 starter notes (parent + chunk docs for each)
4. `provisionUserCredentials(userId)` — create `_users` doc, update `_security.members.names = [userId]`

---

## Shared Vault Creation

Admin-only via `POST /api/admin/vaults`.

**Steps in `createSharedVault(name, creatorUserId)` — `lib/vault.ts`:**

1. Generate `vaultId = "vault-shared-" + 16 random hex chars`
2. `PUT /vault-shared-<hex>` — create CouchDB database
3. `PUT /_security` — lock to admin only initially
4. `PUT /rexform-metadata` — store `{ vaultName, createdBy, createdAt }`
5. Seed 3 starter notes
6. `grantVaultAccess(vaultId, creatorUserId, 'owner')` — Keto write
7. `syncVaultSecurity(vaultId)` — update CouchDB `_security.members.names` from Keto

---

## Starter Notes

Three notes are seeded into every new vault (personal and shared). Each is a parent + chunk pair:

| Title | Parent `_id` | Chunk `_id` |
|---|---|---|
| Welcome to REXFORM Notes | `Welcome to REXFORM Notes.md` | `Welcome to REXFORM Notes.md_c0` |
| Quick Start Guide | `Quick Start Guide.md` | `Quick Start Guide.md_c0` |
| My First Note | `My First Note.md` | `My First Note.md_c0` |

Content is defined in `lib/starter-notes.ts`.

---

## Per-User CouchDB Credential Provisioning

**Steps in `provisionUserCredentials(userId)` — `lib/couchdb-credentials.ts`:**

1. `ensureUsersDb()` — `PUT /_users` (creates if missing; 412 = already exists)
2. `configureCouchDbCors()` — idempotent CORS configuration (5 `PUT` requests to `/_node/nonode@nohost/_config/...`)
3. Generate a 32-char hex password via `crypto.randomBytes(16).toString('hex')`
4. If user already exists in `_users`: fetch `_rev` for in-place update
5. `PUT /_users/org.couchdb.user:<userId>` with `{ name, password, roles: [], type: 'user', livesync_password: password }`
6. `ensureVaultAccess(userId)` — `PUT /vault-<userId>/_security` with `members.names = [userId]`

**Password storage:** CouchDB auto-hashes the `password` field with bcrypt on write. A plaintext copy is stored in the custom `livesync_password` field so the Settings page can display it to the user.

---

## `syncVaultSecurity(vaultId)`

Called after every Keto membership change to keep CouchDB `_security` in sync with Keto tuples. Defined in `lib/vault.ts`.

**Steps:**

1. `getVaultMembers(vaultId)` — reads all relation tuples from Keto Read API (port 4466)
2. Deduplicate userIds: `Array.from(new Set(members.map(m => m.userId)))`
3. `PUT /<vaultId>/_security` — writes `{ admins: { names: ['admin'] }, members: { names: [all userIds] } }`

**Called by:**
- `POST /api/admin/vaults/[vaultId]/members` (add member)
- `PATCH /api/admin/vaults/[vaultId]/members/[userId]` (change role)
- `DELETE /api/admin/vaults/[vaultId]/members/[userId]` (remove member)
- `createSharedVault()` (on vault creation)

If `KETO_READ_URL` is not set, `syncVaultSecurity` is a no-op (exits silently).

---

## Active Vault Resolution

`resolveVault(session, vaultParam?)` in `lib/active-vault.ts` is called by every note API route:

1. If `vaultParam` is absent: read `rexform-active-vault` cookie → return `{ db: cookieValue, canWrite: true }`
2. If `vaultParam` matches the user's personal vault: return `{ db, canWrite: true }`
3. If `vaultParam` is `vault-shared-*`: query Keto for the user's role
   - `owner` or `editor` → `canWrite: true`
   - `viewer` → `canWrite: false`
   - No role / Keto error → fallback to `rexform-active-vault` cookie

---

## Vault Deletion

### Full User Delete — `DELETE /api/admin/users/[id]/vault`

Removes everything associated with a user:

1. Delete Kratos identity via Admin API
2. `DELETE /vault-<userId>` in CouchDB
3. `DELETE /_users/org.couchdb.user:<userId>` (fetches `_rev` first)

All steps are attempted independently — partial failures are reported but do not abort.

---

### Vault-Only Delete — `DELETE /api/admin/users/[id]/vault-db`

Removes CouchDB vault + credentials while preserving the Kratos identity:

1. `DELETE /vault-<userId>` in CouchDB
2. `DELETE /_users/org.couchdb.user:<userId>`

The user account remains in Kratos; an admin can re-provision the vault without recreating the account.

---

### Shared Vault Delete — `DELETE /api/admin/vaults/[vaultId]`

1. `getVaultMembers(vaultId)` — list all Keto tuples
2. Revoke all tuples in parallel
3. `DELETE /<vaultId>` in CouchDB

---

## Vault Switching (User-Facing)

Users switch vaults via the vault switcher in the sidebar. The active vault is stored in an httpOnly cookie `rexform-active-vault`. On switch:

1. `POST /api/vaults` with `{ vault: vaultName }`
2. Server validates the vault is accessible (personal vault or Keto-confirmed shared vault)
3. Sets `rexform-active-vault` cookie
4. UI re-fetches the notes list for the new vault

**Viewer restriction:** The `NotesSidebar` component hides the `+ New` note link when `activeRole === 'viewer'`. The `NoteViewClient` component replaces the Edit button with a "Read-only" badge. If a viewer navigates directly to `/notes/new`, they see an error page rather than the editor.
