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
| Manage members | — admin panel only — | | |

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

All membership changes go through the admin panel and are persisted in two places:

1. **Keto** — the authoritative permission store
2. **CouchDB `_security`** — kept in sync for LiveSync direct access

Every Keto mutation calls `syncVaultSecurity(vaultId)` immediately after, so both stores stay in sync.

**Duplicate tuple prevention:** Before granting a role, the API routes revoke any existing role for the same user on the same vault. This prevents a user from appearing with two roles in Keto.

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
| `getVaultMembers(vaultId)` | Read — port 4466 | List all tuples for a vault |
| `getUserSharedVaults(userId)` | Read — port 4466 | List all vaults a user has any relation on |

**Critical:** `getVaultMembers()` must use the Read URL (port 4466). The Write URL returns empty results for list queries.
