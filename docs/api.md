# API Reference

All routes are implemented in `app/app/api/`. Authentication is enforced by `app/middleware.ts` — every route except `/api/auth/*` and `/api/hooks/*` requires a valid NextAuth JWT session.

---

## Auth

### `GET/POST /api/auth/[...nextauth]`

NextAuth.js handler. Manages session creation, JWT signing, and session retrieval.

| | |
|---|---|
| Auth required | No — handles auth itself |
| Key sub-endpoints | `POST /api/auth/callback/credentials` — submit login, `GET /api/auth/session` — current session, `POST /api/auth/signout` — clear cookie |

---

## Notes

### `GET /api/notes`

List notes in the active vault with pagination.

| | |
|---|---|
| Auth required | Yes |
| Query params | `page` (default: 1), `limit` (default: 20, max: 100), `vault` (optional) |
| Response | `{ rows, total, page, totalPages, hasNext, hasPrev, limit }` |
| Notes | Applies `isVaultNote()` — `.md` files only. Sorted by `mtime` descending. |

---

### `POST /api/notes/create`

Create a new note.

| | |
|---|---|
| Auth required | Yes |
| Query params | `vault` (optional) |
| Request body | `{ title: string, content: string }` |
| Response | `201 { id, title, path }` |
| Creates | Parent doc `<title>.md` + chunk doc `<title>.md_c0` |
| Errors | 401, 400 (missing title), 403 (read-only vault), 500 |

---

### `GET /api/notes/[id]`

Fetch a single note parent document.

| | |
|---|---|
| Auth required | Yes |
| Path param | `id` — URL-encoded note `_id` |
| Query params | `vault` (optional) |
| Response | Raw CouchDB parent document |

---

### `PUT /api/notes/[id]/update`

Update note content.

| | |
|---|---|
| Auth required | Yes |
| Path param | `id` — URL-encoded note `_id` |
| Query params | `vault` (optional) |
| Request body | `{ content: string }` |
| Response | `{ success: true }` |
| Behaviour | If `children.length > 0`: updates first chunk + updates parent `mtime`. If no children: updates `body` on parent directly. |
| Errors | 401, 400, 403 (read-only vault), 404, 500 |

---

### `DELETE /api/notes/[id]/delete`

Delete a note and all its chunk documents.

| | |
|---|---|
| Auth required | Yes |
| Path param | `id` — URL-encoded note `_id` |
| Query params | `vault` (optional) |
| Response | `{ success: true }` |
| Behaviour | Deletes all chunk docs in parallel, then deletes parent doc |
| Errors | 401, 403 (read-only vault), 404, 500 |

---

## Search

### `GET /api/search`

Search notes by title and path.

| | |
|---|---|
| Auth required | Yes |
| Query params | `q` (search string), `vault` (optional) |
| Response | `{ results: [{ _id, title, snippet }] }` — max 50 results |
| Limitation | Searches `path` and `title` fields only — does not search note body content |

---

## Vaults

### `GET /api/vaults`

List all vaults accessible to the current user.

| | |
|---|---|
| Auth required | Yes |
| Response | `{ vaults: [{ name, label, role? }], activeVault: string }` |
| Notes | `role` is included for shared vaults (`owner`/`editor`/`viewer`). Personal vault has no role field. |

---

### `POST /api/vaults`

Switch the active vault.

| | |
|---|---|
| Auth required | Yes |
| Request body | `{ vault: string }` — vault database name |
| Response | `{ activeVault: string }` |
| Behaviour | Validates vault is accessible, sets `rexform-active-vault` httpOnly cookie |
| Errors | 401, 400, 403 (vault not accessible) |

---

## User

### `GET /api/user/credentials`

Get LiveSync credentials for the current user.

| | |
|---|---|
| Auth required | Yes |
| Response | `{ username, password, serverUrl, database }` |
| Behaviour | Reads `_users` doc. Auto-provisions if missing. Also calls `configureCouchDbCors()` idempotently. |
| Errors | 400 (admin user — use obsidian vault directly), 500 |

---

### `POST /api/user/credentials`

Regenerate LiveSync credentials.

| | |
|---|---|
| Auth required | Yes |
| Response | `{ username, password, serverUrl, database }` |
| Behaviour | Generates new 32-char hex password, updates `_users` doc, re-confirms `_security` vault access |
| Errors | 401, 400 (admin user), 500 |

---

## Admin — Users

All admin routes check `isAdminUser(session.user.id)` and return 403 if false.

### `GET /api/admin/users`

List all registered users.

| | |
|---|---|
| Query params | `page` (default: 1), `limit` (default: 20, max: 100) |
| Response | `{ users: [{ id, email, createdAt, state, isAdmin, vault }], total, page, totalPages }` |
| `vault` shape | `{ exists, docCount, dbName, sizeBytes }` |
| Notes | Lists up to 500 identities from Kratos. Admin user sorted first, then by `createdAt` descending. |

---

### `PATCH /api/admin/users/[id]/state`

Suspend or reactivate a user account.

| | |
|---|---|
| Request body | `{ state: "active" \| "inactive" }` |
| Response | `{ success: true, state }` |
| Behaviour | Calls Kratos `patchIdentity` |
| Errors | 403 (cannot change admin's own state) |

---

### `DELETE /api/admin/users/[id]/vault`

Fully delete a user (Kratos identity + CouchDB vault + credentials).

| | |
|---|---|
| Response | `{ success: boolean, results: { kratos, vault, credentials } }` |
| Behaviour | Attempts each step independently. Partial failures reported but do not abort. |
| Protections | Cannot delete admin account |

---

### `DELETE /api/admin/users/[id]/vault-db`

Delete only the CouchDB vault and credentials (Kratos identity preserved).

| | |
|---|---|
| Response | `{ success: boolean, results: { vault, credentials } }` |
| Use case | Re-provision a user's vault without deleting their account |

---

### `POST /api/admin/users/[id]/provision`

Create a missing vault for an existing user.

| | |
|---|---|
| Response | `{ success: true, vaultName }` |
| Behaviour | Calls `createUserVault(userId)` — creates CouchDB DB, sets `_security`, seeds starter notes, provisions LiveSync credentials |

---

## Admin — Shared Vaults

### `GET /api/admin/vaults`

List all shared vaults.

| | |
|---|---|
| Response | `{ vaults: [{ vaultId, vaultName, createdBy, createdAt, docCount, sizeBytes }] }` |
| Behaviour | Lists all CouchDB databases with `vault-shared-` prefix |

---

### `POST /api/admin/vaults`

Create a new shared vault.

| | |
|---|---|
| Request body | `{ name: string }` |
| Response | `201 { vaultId, vaultName }` |
| Behaviour | Creates CouchDB DB, seeds starter notes, stores metadata doc, grants creator `owner` in Keto, syncs `_security` |

---

### `DELETE /api/admin/vaults/[vaultId]`

Delete a shared vault.

| | |
|---|---|
| Path param | `vaultId` — must start with `vault-shared-` |
| Response | `{ success: boolean, results: { keto, couchdb } }` |
| Behaviour | Revokes all Keto tuples, then deletes the CouchDB database |

---

### `GET /api/admin/vaults/[vaultId]/members`

List vault members with email enrichment.

| | |
|---|---|
| Response | `{ members: [{ userId, role, email }] }` |
| Notes | `email` is `null` if the Kratos identity no longer exists |

---

### `POST /api/admin/vaults/[vaultId]/members`

Add or change a member's role.

| | |
|---|---|
| Request body | `{ userId: string, role: "owner" \| "editor" \| "viewer" }` |
| Response | `{ success: true }` |
| Behaviour | Revokes any existing role first (prevents duplicate tuples), grants new role, calls `syncVaultSecurity()` |

---

### `PATCH /api/admin/vaults/[vaultId]/members/[userId]`

Change a member's role.

| | |
|---|---|
| Request body | `{ role: "owner" \| "editor" \| "viewer" }` |
| Response | `{ success: true }` |
| Behaviour | Revokes all existing roles for user, grants new role, syncs `_security` |

---

### `DELETE /api/admin/vaults/[vaultId]/members/[userId]`

Remove a member from a shared vault.

| | |
|---|---|
| Response | `{ success: true }` |
| Protections | Cannot remove the last owner |
| Behaviour | Revokes all Keto tuples for this user on this vault, syncs `_security` |

---

## Webhooks

### `POST /api/hooks/kratos/after-register`

Kratos after-registration webhook. Called by Kratos, not the browser.

| | |
|---|---|
| Auth required | No (must be publicly accessible) |
| Request body | `{ identity: { id, traits: { email } } }` |
| Response | Always `200 { status: "ok", vaultCreated: boolean }` |
| Behaviour | Calls `createUserVault(identityId)`. Never returns non-200. |
