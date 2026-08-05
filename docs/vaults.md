# Vault Management

There are three kinds of vault: the legacy single-tenant `obsidian` DB (admin-only, the only vault ever proxied through Oathkeeper — and only for reads), each user's primary `vault-<userId>` (personal, provisioned automatically), and two DB-name-prefixed opt-in kinds a user creates themselves: extra personal vaults (`uvault-<userId>-<slug>`, "My Vaults") and shared vaults (`vault-shared-<hex>`, Keto-governed). CouchDB LiveSync provides offline/multi-device sync on top of any of them.

## Personal Vault Creation (primary vault)

Triggered automatically by the Kratos after-registration webhook (`/api/hooks/kratos/after-register`), or on first login for SSO-only users (`ensureUserVault()` in the NextAuth `signIn` callback, since the webhook never fires for them). Can also be triggered manually by an admin via `POST /api/admin/users/[id]/provision`.

**Steps in `createUserVault(userId)` — `lib/vault.ts`:**

1. `PUT /vault-<userId>` — create CouchDB database (412 = already exists, treated as success)
2. `PUT /vault-<userId>/_security` — lock to admin only (`members.names = []`)
3. Seed 3 starter notes (parent + chunk docs for each)
4. `provisionUserCredentials(userId)` — create `_users` doc, update `_security.members.names = [userId]`

`ensureUserVault(userId)` wraps this with a `HEAD` existence check first — used wherever the vault must exist but must NOT be unconditionally re-provisioned (re-running `createUserVault` rotates the user's LiveSync password every time).

---

## Extra Personal Vault Creation ("My Vaults")

User-facing, via `POST /api/vaults/create`. Reuses the shared-vault machinery (isolated CouchDB DB + Keto owner tuple) but with nobody else invited.

**Steps in `createPersonalVault(userId, name, template)` — `lib/vault.ts`:**

1. DB name is `uvault-<userId>-<slug(name)>`; on a slug collision (412), retries up to 3 times with a random 6-char suffix appended
2. `PUT /<vaultId>/_security` — lock to admin only initially
3. `PUT /rexform-metadata` — store `{ vaultName, kind: 'personal', createdBy, createdAt }`
4. If `template === 'starter'` (the default; `'blank'` skips this): seed 3 starter notes
5. `grantVaultAccess(vaultId, userId, 'owner')` — Keto write, then `syncVaultSecurity(vaultId)`

Capped at `MAX_PERSONAL_VAULTS` (5) extra vaults per user, enforced in the route via `countPersonalVaults(userId)` (counts CouchDB DBs by prefix, not a stored counter).

Rename (`PATCH /api/vaults/[vaultId]`) only rewrites the `rexform-metadata` doc's `vaultName` — the DB name never changes. Both rename and delete require `vaultId` to start with the caller's own `uvault-<userId>-` prefix.

---

## Shared Vault Creation

Two entry points share the same `createSharedVault(name, creatorUserId)` in `lib/vault.ts`:

- `POST /api/admin/vaults` — admin-only
- `POST /api/shared-vaults` — user-facing; any authenticated user may create one (capped at `MAX_SHARED_VAULTS_OWNED` (5) vaults owned per user). After creation it additionally verifies the owner tuple actually landed in Keto (`checkVaultAccess`) and rolls back — deletes the just-created vault — if it didn't, since `createSharedVault` itself only warns on a failed Keto grant and an ungranted vault would otherwise be an invisible, ownerless orphan.

**Steps in `createSharedVault(name, creatorUserId)`:**

1. Generate `vaultId = "vault-shared-" + 16 random hex chars`
2. `PUT /vault-shared-<hex>` — create CouchDB database
3. `PUT /_security` — lock to admin only initially
4. `PUT /rexform-metadata` — store `{ vaultName, createdBy, createdAt }`
5. Seed 3 starter notes
6. `grantVaultAccess(vaultId, creatorUserId, 'owner')` — Keto write
7. `syncVaultSecurity(vaultId)` — update CouchDB `_security.members.names` from Keto

---

## Shared Vault Membership (user-facing)

Managed via `/api/shared-vaults/[vaultId]/members*`, gated by the caller's own Keto role rather than `isAdminUser()` (parallel to, but separate from, the admin routes under `/api/admin/vaults/[vaultId]/members*`).

- **List** (`GET .../members`) — any member (any role) can view the roster + emails.
- **Invite / change role** (`POST .../members`) — owner only; resolves an email or user id via `resolveUserIdentifier()`, revokes any existing tuple for that user first (one role per user), then grants the new role and syncs `_security`. Blocks a sole owner from demoting themselves.
- **Remove / leave** (`DELETE .../members/[userId]`) — owners can remove anyone; non-owners can only remove themselves ("leave vault"). Cannot remove the last remaining owner. Clears the `rexform-active-vault` cookie if the caller left the vault they were viewing.

### Invite links

`POST /api/shared-vaults/[vaultId]/invite-link` (owner only) generates a single-use link instead of requiring a known identifier:

1. `createVaultInviteLink(vaultId, role, createdBy)` — role restricted to `editor`/`viewer` (link invites cannot grant ownership)
2. Deletes any invite doc still active for the vault first — only one live link per vault at a time
3. Stores a `rexform-invite-<token>` doc with a 5-minute `expiresAt` (`INVITE_TTL_MS`)

Acceptance is a separate preview/accept pair at `/api/shared-vaults/[vaultId]/invite-link/[token]`:

- `GET` — preview (vault name, role, expiry, whether the caller is already a member) without consuming the token
- `POST` — accept: grants the invite's role via Keto, syncs `_security`, then deletes the invite doc (`consumeVaultInvite`). If the caller is already a member, the existing (possibly higher) role is left untouched but the token is still consumed so it can't be reused.

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

1. If `vaultParam` is absent: falls back to `getActiveVault(session)` (reads the `rexform-active-vault` cookie, validating it first — see below) → `{ db, canWrite: true }`
2. If `vaultParam` matches the user's primary personal vault: return `{ db, canWrite: true }`
3. If `vaultParam` starts with the user's extra-personal-vault prefix (`uvault-<userId>-`): return `{ db, canWrite: true }` — ownership is encoded in the DB name, no Keto lookup needed
4. If `vaultParam` is `vault-shared-*`: query Keto for the user's role
   - `owner` or `editor` → `canWrite: true`
   - `viewer` → `canWrite: false`
   - No role / Keto error / `KETO_READ_URL` unset → fallback to `getActiveVault(session)`

`getActiveVault(session)` itself only trusts the `rexform-active-vault` cookie if it names the user's personal vault, an owned `uvault-` vault, or a shared vault the user has any Keto role on (`isVaultAccessible()`); otherwise it defaults to the user's primary vault.

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

### Extra Personal / User-Facing Shared Vault Delete — `deletePersonalVault(vaultId)`

A single generic helper in `lib/vault.ts` backs three routes: `DELETE /api/vaults/[vaultId]` (extra personal vault, owner-only via prefix check), `DELETE /api/shared-vaults/[vaultId]` (shared vault, owner-only via Keto role check), and the admin shared-vault delete above reimplements the same two steps inline.

1. `getVaultMembers(vaultId)` + revoke all Keto tuples for it (no-op/warns if Keto is unreachable — does not block deletion)
2. `DELETE /<vaultId>` in CouchDB (404 treated as success)

Both user-facing routes also clear the `rexform-active-vault` cookie if it pointed at the vault just deleted.

---

## Vault Switching (User-Facing)

Users switch vaults via the vault switcher in the sidebar. The active vault is stored in an httpOnly cookie `rexform-active-vault`. On switch:

1. `POST /api/vaults` with `{ vault: vaultName }`
2. Server validates the vault is accessible (primary vault, an owned `uvault-` extra personal vault, or a Keto-confirmed shared vault) via `getAccessibleVaults()`
3. Sets `rexform-active-vault` cookie
4. UI re-fetches the notes list for the new vault

**Viewer restriction:** The `NotesSidebar` component hides the `+ New` note link when `activeRole === 'viewer'`. The `NoteViewClient` component replaces the Edit button with a "Read-only" badge. If a viewer navigates directly to `/notes/new`, they see an error page rather than the editor.
