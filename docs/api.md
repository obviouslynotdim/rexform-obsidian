# API Reference

All routes are implemented in `app/app/api/`. Authentication is enforced by `app/middleware.ts` — every route except `/api/auth/*` and `/api/hooks/*` requires a valid NextAuth JWT session.

---

## Auth

### `GET/POST /api/auth/[...nextauth]`

NextAuth.js handler (`app/lib/auth.ts`). Two providers: `credentials` (bridges to a Kratos login flow — `authorize()` calls `updateLoginFlow` and returns the Kratos identity id + session token) and `rexform-sso` (an OAuth provider for the central REXFORM IAM, an Ory Hydra instance; only registered when `SSO_ISSUER_URL`/`SSO_CLIENT_ID`/`SSO_CLIENT_SECRET` are set).

| | |
|---|---|
| Auth required | No — handles auth itself |
| Key sub-endpoints | `POST /api/auth/callback/credentials` — submit login, `GET /api/auth/callback/rexform-sso` — SSO OAuth callback, `GET /api/auth/session` — current session, `POST /api/auth/signout` — clear cookie |
| SSO behaviour | On `signIn`, if the SSO email matches an existing local Kratos identity, `user.id` is rewritten to that identity's id (avoids a second account/vault for the same email); `ensureUserVault()` provisions the vault on first SSO login since the Kratos after-register webhook never fires for SSO-only users; unlinked SSO users are recorded via `upsertSsoUser()` for the admin panel |
| Session shape | `session.user.id`, `session.user.isAdmin`, `session.kratosSessionToken`, `session.provider` (`"credentials"` or `"rexform-sso"`) |

---

### `POST /api/auth/kratos/flow`

Submit a Kratos login flow (proxied server-side so the browser never talks to Kratos directly).

| | |
|---|---|
| Auth required | No |
| Request body | `{ flowId, email, password }` |
| Response | Kratos login flow result (`{ session, session_token }`) |
| Errors | Passthrough of Kratos error status + body |

---

### `POST /api/auth/kratos/register`

Submit a Kratos registration flow.

| | |
|---|---|
| Auth required | No |
| Request body | `{ flowId, email, password, firstName, lastName }` |
| Response | Kratos registration flow result |
| Behaviour | Calls `updateRegistrationFlow` with `method: 'password'`, traits `{ email, name: { first, last } }` |
| Errors | Passthrough of Kratos error status + body, else 500 |

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

### `GET /api/notes/[id]/content`

Fetch assembled note content (chunks concatenated, frontmatter stripped).

| | |
|---|---|
| Auth required | Yes |
| Path param | `id` — URL-encoded note `_id` |
| Query params | `vault` (optional) |
| Response | `{ content, title }` |
| Behaviour | `getNote()` → `assembleNoteContent()` → `stripFrontmatter()` |

---

### `GET /api/notes/[id]/backlinks`

List notes that link to this note via `[[wikilinks]]`.

| | |
|---|---|
| Auth required | Yes |
| Path param | `id` — URL-encoded target note `_id` |
| Query params | `vault` (optional) |
| Response | `{ backlinks: [{ id, title, snippet }], targetId }` |
| Behaviour | Scans all other notes' assembled content for wikilinks resolving to the target; builds a ~120-char snippet around the first mention; sorted by title |

---

### `POST /api/notes/[id]/move`

Rename and/or move a single note.

| | |
|---|---|
| Auth required | Yes |
| Path param | `id` — URL-encoded old note `_id` |
| Query params | `vault` (optional) |
| Request body | `{ folder?: string, name?: string }` — omit `folder` to keep folder, omit `name` to keep filename |
| Response | `{ id: newId }` |
| Behaviour | Copies chunks + parent to new IDs (updates `path`, `children`, `mtime`, `title`), deletes originals. Deletes the target folder's `.keep`; recreates `.keep` in the old folder if it becomes empty. On title change, fires best-effort background `updateBacklinks()` rewriting `[[Old Name]]` → `[[New Name]]` across the vault (preserves `#heading` / `\|alias` suffixes). |
| Errors | 401, 400, 403 (read-only vault), 404 (source missing), 409 (destination exists), 500 |

---

### `GET /api/notes/tree`

Flat file/folder listing for the sidebar file tree.

| | |
|---|---|
| Auth required | Yes |
| Query params | `vault` (optional) |
| Response | `{ notes: [{ id, path, title, mtime?, ctime? }, ..., { id, path, isMarker: true }, ...] }` |
| Behaviour | Notes (via `isVaultNote()`) sorted by path, then `.keep` folder markers appended |

---

### `GET /api/notes/graph`

Wikilink graph for the D3 knowledge graph view.

| | |
|---|---|
| Auth required | Yes |
| Query params | `vault` (optional), `folder` (optional — scope to a folder subtree) |
| Response | `{ nodes: [{ id, path, title, linkCount }], edges: [{ source, target }] }` |
| Behaviour | Assembles every note's content, extracts `[[wikilinks]]`, resolves by filename (case-insensitive, `-`/`_` → space, with/without `.md`). Edges deduped and undirected; self-links skipped. |

---

## Folders

### `POST /api/notes/folder/create`

Create an empty folder.

| | |
|---|---|
| Auth required | Yes |
| Query params | `vault` (optional) |
| Request body | `{ folder: string }` |
| Response | `201 { folder }` (200 if it already existed) |
| Behaviour | Creates a `<folder>/.keep` marker doc (`{ _id, rexform_marker: true, path }`). Idempotent. |
| Errors | 401, 400, 403 (read-only vault) |

---

### `POST /api/notes/folder/rename`

Rename a folder in place.

| | |
|---|---|
| Auth required | Yes |
| Query params | `vault` (optional) |
| Request body | `{ oldPath: string, newName: string }` |
| Response | `{ renamed: number, errors?: string[] }` |
| Behaviour | Replaces the last path segment; copies each affected note + chunks to new IDs, deletes originals. Does not rewrite wikilinks. |
| Errors | 401, 400, 403 (read-only vault) |

---

### `POST /api/notes/folder/move`

Move a folder (and its subtree) into another folder.

| | |
|---|---|
| Auth required | Yes |
| Query params | `vault` (optional) |
| Request body | `{ source: string, target: string }` |
| Response | `{ moved: number }` |
| Behaviour | New path is `target/<lastSegmentOfSource>`. Copies affected notes, chunks, and `.keep` markers; deletes originals. Manages `.keep` markers on both ends. |
| Errors | 401, 400 (missing source / move into own descendant), 403 (read-only vault), 500 |

---

### `DELETE /api/notes/folder`

Delete a folder and all its contents.

| | |
|---|---|
| Auth required | Yes |
| Query params | `path` (required — folder path), `vault` (optional) |
| Response | `{ deleted: number }` |
| Behaviour | Deletes every note (chunks first) and folder marker under `path/` |
| Errors | 401, 400, 403 (read-only vault) |

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

Full-text search across note titles, paths, and body content. Backs the Ctrl+K quick switcher.

| | |
|---|---|
| Auth required | Yes |
| Query params | `q` (search string; empty → `{ results: [] }`), `vault` (optional) |
| Response | `{ results: [{ _id, title, snippet, matchIn: "title" \| "content" \| "path" }] }` — max 50 results |
| Notes | `matchIn` priority: title > content > path. Body matching reads inline `body`/`content`/`text` fields (not chunk-assembled), so bodies of multi-chunk LiveSync notes may not match. |

---

## Kanban

### `GET /api/kanban/boards`

List Kanban boards in the active vault.

| | |
|---|---|
| Auth required | Yes |
| Query params | `vault` (optional) |
| Response | `{ boards: [{ id, title, path, mtime, columns, cards }] }` — sorted by `mtime` descending |
| Behaviour | Single `_all_docs` scan; a note is a board if its frontmatter contains the `kanban-plugin` key; column/card counts via `parseKanban()` |

---

## GitLab

Full server-side proxy for the GitLab community plugin — the browser never talks to GitLab directly. The personal access token is stored encrypted (`lib/gitlab.ts`) and never returned by any of these routes.

### `GET /api/gitlab/config`

Connection status.

| | |
|---|---|
| Auth required | Yes |
| Response | `{ connected: false }` or `{ connected: true, host, username }` |

---

### `POST /api/gitlab/config`

Connect a GitLab account.

| | |
|---|---|
| Auth required | Yes |
| Request body | `{ host: string, token: string }` |
| Response | `{ connected: true, host, username }` |
| Behaviour | Verifies the token against `GET /user` on the target host before storing it (encrypted) |
| Errors | 401, 400 (missing token, or GitLab unreachable/invalid token), 500 |

---

### `DELETE /api/gitlab/config`

Disconnect the current user's GitLab account.

| | |
|---|---|
| Auth required | Yes |
| Response | `{ connected: false }` |

---

### `GET /api/gitlab/projects`

List projects the connected account is a member of.

| | |
|---|---|
| Auth required | Yes |
| Query params | `search` (optional) |
| Response | `{ projects: [{ id, name, pathWithNamespace, webUrl }] }` |
| Behaviour | Proxies `GET /projects` (membership, ordered by last activity, max 30) |
| Errors | 401, 400 (GitLab not connected), 502 (GitLab request failed) |

---

### `GET /api/gitlab/issues`

List issues for one project.

| | |
|---|---|
| Auth required | Yes |
| Query params | `projectId` (required), `state` (`opened` \| `closed` \| `all`, default `opened`), `search` (optional) |
| Response | `{ issues: [{ iid, title, state, webUrl, labels, author, assignee, milestone, updatedAt, description }] }` — max 50, sorted by `updated_at` descending |
| Errors | 401, 400 (missing `projectId` or GitLab not connected), 502 |

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

### `POST /api/vaults/create`

Create an additional personal ("My Vaults") vault.

| | |
|---|---|
| Auth required | Yes |
| Request body | `{ name: string, template?: "blank" \| "starter" }` — `name` max 60 chars, `template` defaults to `"starter"` |
| Response | `201 { vaultId, vaultName }` |
| Behaviour | `createPersonalVault()` — DB name `uvault-<userId>-<slug>` (slug collision retried with a random suffix); grants the creator `owner` in Keto and syncs `_security`. Limited to `MAX_PERSONAL_VAULTS` (5) extra vaults per account. |
| Errors | 401, 400 (missing/too-long name), 403 (vault limit reached), 500 |

---

### `PATCH /api/vaults/[vaultId]`

Rename a personal vault the caller owns.

| | |
|---|---|
| Auth required | Yes |
| Path param | `vaultId` — must start with the caller's personal-vault prefix (`uvault-<userId>-`) |
| Request body | `{ name: string }` — max 60 chars |
| Response | `{ vaultId, vaultName }` |
| Behaviour | Updates the `rexform-metadata` doc only — the CouchDB database name is immutable |
| Errors | 401, 403 (not owner), 400 (invalid name), 500 |

---

### `DELETE /api/vaults/[vaultId]`

Delete a personal vault the caller owns.

| | |
|---|---|
| Auth required | Yes |
| Path param | `vaultId` — must start with the caller's personal-vault prefix |
| Response | `{ success: true }` |
| Behaviour | Revokes Keto tuples, deletes the CouchDB database; clears the `rexform-active-vault` cookie if it pointed at the deleted vault |
| Errors | 401, 403 (not owner), 500 |

---

## Shared Vaults (user-facing)

Distinct from the `Admin — Shared Vaults` routes below: any authenticated user may create a shared vault and becomes its Keto `owner`; membership actions here are gated by the caller's own Keto role rather than `isAdminUser()`.

### `POST /api/shared-vaults`

Create a new shared vault.

| | |
|---|---|
| Auth required | Yes |
| Request body | `{ name: string }` — max 60 chars |
| Response | `201 { vaultId, vaultName }` |
| Behaviour | `createSharedVault()`, then verifies the owner Keto tuple actually landed (`checkVaultAccess`) — rolls back (deletes the vault) and returns 503 if Keto is unreachable, rather than leaving an orphaned vault with no owner. Limited to `MAX_SHARED_VAULTS_OWNED` (5) vaults owned per account. |
| Errors | 401, 503 (Keto disabled via missing `KETO_WRITE_URL`, or unreachable), 400 (invalid name / owned-vault limit reached), 500 |

---

### `PATCH /api/shared-vaults/[vaultId]`

Rename a shared vault. Owner only.

| | |
|---|---|
| Auth required | Yes — caller's Keto role must be `owner` |
| Request body | `{ name: string }` |
| Response | `{ vaultId, vaultName }` |
| Errors | 401, 400 (not a `vault-shared-*` id, invalid name), 403 (not owner), 500 |

---

### `DELETE /api/shared-vaults/[vaultId]`

Delete a shared vault. Owner only.

| | |
|---|---|
| Auth required | Yes — caller's Keto role must be `owner` |
| Response | `{ success: true }` |
| Behaviour | Reuses the same generic delete as personal vaults (Keto tuple revoke + CouchDB DB drop); clears the active-vault cookie if needed |
| Errors | 401, 400, 403 (not owner), 500 |

---

### `GET /api/shared-vaults/[vaultId]/members`

List a shared vault's members. Any member may view.

| | |
|---|---|
| Auth required | Yes — caller must have some role on the vault |
| Response | `{ members: [{ userId, role, email }], myRole }` |
| Errors | 401, 400 (not a shared vault), 403 (no role on vault), 500 |

---

### `POST /api/shared-vaults/[vaultId]/members`

Invite a user by email/id, or change an existing member's role. Owner only.

| | |
|---|---|
| Auth required | Yes — caller's Keto role must be `owner` |
| Request body | `{ identifier: string, role: "owner" \| "editor" \| "viewer" }` — `identifier` is an email or user id, resolved via `resolveUserIdentifier()` |
| Response | `{ success: true, userId, email, role }` |
| Behaviour | Revokes any existing tuples for the target before granting the new role (one role per user); blocks self-demotion if it would leave the vault ownerless; syncs `_security` |
| Errors | 401, 400 (not a shared vault / invalid identifier or role / sole-owner self-demotion), 403 (not owner), 404 (no user found for identifier), 500 |

---

### `DELETE /api/shared-vaults/[vaultId]/members/[userId]`

Remove a member, or leave the vault (removing yourself).

| | |
|---|---|
| Auth required | Yes — owners may remove anyone; non-owners may only remove themselves |
| Response | `{ success: true }` |
| Protections | Cannot remove the sole remaining owner |
| Behaviour | Clears the `rexform-active-vault` cookie if the caller left the vault they were viewing |
| Errors | 401, 400 (not a shared vault), 403 (no role, or non-owner targeting someone else), 404 (target not a member), 500 |

---

### `POST /api/shared-vaults/[vaultId]/invite-link`

Generate a single-use invite link. Owner only.

| | |
|---|---|
| Auth required | Yes — caller's Keto role must be `owner` |
| Request body | `{ role: "editor" \| "viewer" }` — ownership cannot be granted via link |
| Response | `{ token, role, expiresAt }` |
| Behaviour | `createVaultInviteLink()` — 5-minute TTL; creating a new link replaces (revokes) any still-active link for the same vault, so only one live link exists per vault |
| Errors | 401, 400 (not a shared vault, invalid role), 403 (not owner), 500 |

---

### `GET /api/shared-vaults/[vaultId]/invite-link/[token]`

Preview an invite without consuming it.

| | |
|---|---|
| Auth required | Yes — any signed-in user holding the link |
| Response | `{ vaultName, role, expiresAt, alreadyMember: boolean }` |
| Errors | 401, 400 (not a shared vault), 410 (invalid/expired token) |

---

### `POST /api/shared-vaults/[vaultId]/invite-link/[token]`

Accept an invite: grants the role and consumes the token.

| | |
|---|---|
| Auth required | Yes |
| Response | `{ vaultId, vaultName, role, alreadyMember? }` |
| Behaviour | If already a member, consumes the token (so it can't be reused) without downgrading the existing role. Otherwise grants the invite's role in Keto, syncs `_security`, then consumes the token. |
| Errors | 401, 400 (not a shared vault), 410 (invalid/expired token), 500 |

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

### `POST /api/user/password`

Change the current user's password.

| | |
|---|---|
| Auth required | Yes |
| Request body | `{ currentPassword, newPassword }` — `newPassword` min 8 chars |
| Response | `{ ok: true }` |
| Behaviour | Verifies `currentPassword` by submitting a fresh native Kratos login flow (works even for SSO-linked sessions, which carry no Kratos session token), then calls Kratos `updateIdentity` with the new password credential |
| Errors | 401, 400 (missing/short fields, or account has no password to change — SSO-only), 401 (current password incorrect), 500 |

---

### `GET /api/user/profile`

Get the current user's profile.

| | |
|---|---|
| Auth required | Yes |
| Response | `{ accountType: "local" \| "sso-only", firstName, lastName, email, username, hasPassword }` |
| Behaviour | Reads the Kratos identity if one exists (`accountType: "local"`); otherwise falls back to the SSO-only user registry (`lib/sso-users.ts`, `accountType: "sso-only"`, `hasPassword: false`) |
| Errors | 401, 404 (no local identity and no SSO record) |

---

### `PATCH /api/user/profile`

Update the current user's name/username.

| | |
|---|---|
| Auth required | Yes |
| Request body | `{ firstName?, lastName?, username? }` — partial |
| Response | Updated profile (same shape as GET) |
| Behaviour | Local identities: full `updateIdentity` PUT merging `traits.name` and `metadata_public.username`. SSO-only accounts: only `username` persists (via `updateSsoUserProfile()`) — name is sourced from IAM claims and overwritten on every SSO login |
| Errors | 401, 400 (invalid username — must match `[a-zA-Z0-9_.-]{3,32}`), 404, 500 |

---

### `GET /api/user/plugins` / `POST /api/user/plugins`

Read / write the user's community-plugin install state.

| | |
|---|---|
| Auth required | Yes |
| GET response | `{ installed: string[], enabled: Record<string, boolean> }` — defaults to empty on first use |
| POST body | `{ installed: string[], enabled: Record<string, boolean> }` |
| Behaviour | Stored in the `rexform-plugins` doc in the user's personal vault. Legacy `{ plugins: { id: bool } }` shape auto-migrated. Admin users get an in-memory default (no persistence). |
| Errors | 401, 400 (invalid body), 500 |

---

### `GET /api/user/settings` / `POST /api/user/settings`

Read / write user preferences.

| | |
|---|---|
| Auth required | Yes |
| Settings shape | `{ syncHeadingWithFilename: boolean, newNoteLocation: "root" \| "current", language: "en" \| "kh" }` — defaults: `true`, `"root"`, `"en"` |
| POST body | Settings object (bare or `{ settings: {...} }` envelope); partial — merges over existing values |
| Behaviour | Stored in the `rexform-settings` doc in the user's personal vault. Admin users get defaults. |
| Errors | 401, 400 (invalid body), 500 |

---

## Admin — Users

All admin routes check `isAdminUser(session.user.id)` and return 403 if false.

### `GET /api/admin/users`

List all registered users, unifying local Kratos identities with SSO-only accounts (no local Kratos identity — recorded in `lib/sso-users.ts` on first SSO login, or recovered as an orphan `vault-<id>` DB with no matching identity or registry entry).

| | |
|---|---|
| Query params | `page` (default: 1), `limit` (default: 20, max: 100), `search` (matches email or id), `state` (`all` \| `active` \| `suspended`), `vault` (`all` \| `has` \| `none`) |
| Response | `{ users: [{ id, email, createdAt, state, isAdmin, provider, vault, extraVaults }], total, page, totalPages, stats }` |
| `vault` shape | `{ exists, docCount, dbName, sizeBytes }` |
| `extraVaults` shape | `[{ dbName, name, docCount, sizeBytes }]` — personal `uvault-<userId>-<slug>` vaults ("My Vaults") owned by this user |
| `provider` | `"local"` (has a Kratos identity) or `"sso"` (SSO-only) |
| `stats` | `{ total, activeVaults, suspended, missingVaults }` — computed over the full (unfiltered) user list; `activeVaults` counts primary + extra vaults |
| Notes | Lists up to 500 identities from Kratos. Search/state/vault filters run before pagination. Admin user sorted first, then by `createdAt` descending. Returns 503 with a guidance message if the Kratos admin API is unreachable (common in local dev — `railway.internal` hostnames only resolve inside Railway). |

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
| Response | `200 { status: "ok", vaultCreated: boolean }` — `vaultCreated: false` if vault creation itself throws (non-fatal, since Kratos registration must not be blocked); `500 { status: "error" }` only if the request body itself can't be parsed |
| Behaviour | Calls `createUserVault(identityId)`. Vault-creation errors never surface as a non-200 to Kratos. |
