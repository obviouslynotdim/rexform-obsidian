# Permission Model

## Keto Namespace Structure

REXFORM Notes uses a single Keto namespace with three relations.

```
Namespace: vault

Object:    <CouchDB database name>        e.g. vault-shared-a1b2c3d4e5f6a7b8
Relations: owner | editor | viewer
Subject:   <Kratos identity UUID>         e.g. 957e5bcc-eb3f-442d-b5ec-0f47cac3282c

Example tuples:
  vault:vault-shared-abc123#owner@user-uuid-1
  vault:vault-shared-abc123#editor@user-uuid-2
  vault:vault-shared-abc123#viewer@user-uuid-3
```

Keto APIs:
- **Read API** — port 4466 — `GET /relation-tuples`, `GET /relation-tuples/check`
- **Write API** — port 4467 — `POST /admin/relation-tuples`, `DELETE /admin/relation-tuples`

---

## Role Capabilities

| Action | owner | editor | viewer |
|---|---|---|---|
| Read notes | ✓ | ✓ | ✓ |
| Create notes | ✓ | ✓ | ✗ |
| Update notes | ✓ | ✓ | ✗ |
| Delete notes | ✓ | ✓ | ✗ |
| Switch to vault | ✓ | ✓ | ✓ |
| LiveSync direct access | ✓ | ✓ | ✓ |
| Manage members / invite links | ✓ | ✗ | ✗ |
| Manage members (admin panel) | — any admin, regardless of role — | | |

Write routes (`/create`, `/update`, `/delete`) return `403` when `canWrite === false` (viewer role).

---

## How Permissions Are Checked in API Routes

Every note API route calls `resolveVault(session, vaultParam?)` from `lib/active-vault.ts`:

```typescript
// Personal vaults: always canWrite=true, no Keto call
if (isPersonalVault(session, vaultParam)) {
  return { db: vaultParam, canWrite: true };
}

// Shared vaults: 3 sequential Keto checks
const isOwner  = await checkVaultAccess(vaultId, userId, 'owner');
const isEditor = !isOwner  && await checkVaultAccess(vaultId, userId, 'editor');
const isViewer = !isEditor && await checkVaultAccess(vaultId, userId, 'viewer');
// canWrite = isOwner || isEditor
```

`checkVaultAccess()` in `lib/keto.ts` calls `GET /relation-tuples/check` on the Keto Read API.

---

## Membership Management

Membership changes have two entry points — a dashboard self-service page for vault owners, and an admin panel for admins:

1. **Dashboard self-service** — `app/app/dashboard/vaults/[vaultId]/page.tsx`, backed by `app/app/api/shared-vaults/[vaultId]/*`. The vault owner can:
   - Add/change a member's role directly by email or user ID (`POST /api/shared-vaults/[vaultId]/members`)
   - Generate a **single-use, 5-minute invite link** capped at editor/viewer (`POST /api/shared-vaults/[vaultId]/invite-link`) — the recipient previews it, then accepts at `/invite/[vaultId]/[token]`, which grants the role and consumes the token (`app/app/api/shared-vaults/[vaultId]/invite-link/[token]/route.ts`)
   - Only owners can mutate the roster; any member can view it. The API blocks a sole owner from demoting themselves (would orphan the vault)
2. **Admin panel** — `app/app/api/admin/vaults/[vaultId]/members/*` — an admin-side path to the same operations, independent of the dashboard flow

Both paths write to the same two stores:

1. **Keto** — the authoritative permission store
2. **CouchDB `_security`** — kept in sync for LiveSync direct access

Every Keto mutation calls `syncVaultSecurity(vaultId)` immediately after, so both stores stay in sync.

**Duplicate tuple prevention:** Before granting a role, the API routes revoke any existing role for the same user on the same vault. This prevents a user from appearing with two roles in Keto.

**Not real-time collaboration:** shared-vault access is role-based read/write, synchronized via CouchDB replication (LiveSync-style, eventually consistent). There is no live multiplayer editing — no CRDT/OT merge, no presence indicators, no cursors. Two editors saving the same note concurrently can still conflict at the CouchDB document-revision level.

---

## Admin Bypass

`isAdminUser(userId)` in `lib/vault.ts` checks `userId === process.env.ADMIN_USER_ID`.

When true, the user:
- Is routed to the `obsidian` vault regardless of any vault cookie or parameter
- Has `isAdmin: true` in their JWT session
- Can access all admin panel routes
- Cannot be deleted, suspended, or have their vault deleted via any admin API route

The admin bypasses Keto entirely — their vault is personal, not shared.

---

## CouchDB `_security` Sync

Keto is the authoritative store. CouchDB `_security` is a derived, synchronized copy used only by LiveSync (direct CouchDB connections bypass `rexform-notes`).

If they drift out of sync:
- **Web app access** — still enforces Keto (every request calls `resolveVault` → Keto)
- **LiveSync access** — reflects `_security` state only

`syncVaultSecurity()` is called after every admin membership change to prevent drift. See [Vault Management → syncVaultSecurity](vaults.md#syncvaultsecurityvaultid) for implementation details.

---

## Keto Client Usage

`lib/keto.ts` exports:

| Function | API | Description |
|---|---|---|
| `grantVaultAccess(vaultId, userId, role)` | Write — port 4467 | Create a relation tuple |
| `revokeVaultAccess(vaultId, userId, role)` | Write — port 4467 | Delete a relation tuple |
| `checkVaultAccess(vaultId, userId, role)` | Read — port 4466 | Check if a specific tuple exists |
| `getUserVaultRole(vaultId, userId)` | Read — port 4466 | Returns the caller's single role (`owner`\|`editor`\|`viewer`\|`null`) — checks owner→editor→viewer in order and short-circuits |
| `getVaultMembers(vaultId)` | Read — port 4466 | List all tuples for a vault |
| `getUserSharedVaults(userId)` | Read — port 4466 | List all vaults a user has any relation on |

**Critical:** `getVaultMembers()` must use the Read URL (port 4466). The Write URL returns empty results for list queries.
