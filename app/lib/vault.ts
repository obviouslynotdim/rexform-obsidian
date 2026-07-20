import crypto from 'crypto';
import { getStarterNotes } from './starter-notes';
import { provisionUserCredentials } from './couchdb-credentials';
import type { VaultRole } from './keto';

// Use public CouchDB URL for admin operations — the Railway internal hostname
// rejects Basic auth; the public domain is proven to work with admin credentials.
const COUCHDB_INTERNAL_URL =
  process.env.COUCHDB_URL || process.env.COUCHDB_INTERNAL_URL || 'http://localhost:5984';
const COUCHDB_ADMIN_USER =
  process.env.COUCHDB_ADMIN_USER || process.env.COUCHDB_USERNAME || 'admin';
const COUCHDB_ADMIN_PASSWORD =
  process.env.COUCHDB_ADMIN_PASSWORD || process.env.COUCHDB_PASSWORD || '';

function adminAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${COUCHDB_ADMIN_USER}:${COUCHDB_ADMIN_PASSWORD}`).toString('base64');
}

export function getUserVaultName(userId: string): string {
  return `vault-${userId}`;
}

export function getAdminVaultName(): string {
  return 'obsidian';
}

export function getPersonalVaultPrefix(userId: string): string {
  return `uvault-${userId}-`;
}

export const MAX_PERSONAL_VAULTS = 5;
export const MAX_SHARED_VAULTS_OWNED = 5;

export async function syncVaultSecurity(vaultId: string): Promise<void> {
  if (!process.env.KETO_READ_URL) return;
  try {
    const { getVaultMembers } = await import('./keto');
    const members = await getVaultMembers(vaultId);
    const names = Array.from(new Set(members.map((m) => m.userId)));
    await fetch(`${COUCHDB_INTERNAL_URL}/${vaultId}/_security`, {
      method: 'PUT',
      headers: { Authorization: adminAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admins: { names: ['admin'], roles: ['_admin'] },
        members: { names, roles: [] },
      }),
    });
  } catch (e) {
    console.warn(`[vault] syncVaultSecurity failed for ${vaultId}:`, e);
  }
}

export function isAdminUser(userId: string): boolean {
  const adminId = process.env.ADMIN_USER_ID;
  return !!adminId && userId === adminId;
}

export async function createUserVault(userId: string): Promise<{ vaultName: string }> {
  const vaultName = getUserVaultName(userId);
  const base = COUCHDB_INTERNAL_URL;
  const auth = adminAuthHeader();

  // Create the database (412 = already exists, treat as success)
  const createRes = await fetch(`${base}/${vaultName}`, {
    method: 'PUT',
    headers: { Authorization: auth },
  });
  if (!createRes.ok && createRes.status !== 412) {
    const body = await createRes.text();
    throw new Error(`Failed to create vault ${vaultName}: ${createRes.status} ${body}`);
  }

  // Lock down the database so only server-side admin credentials can access it
  await fetch(`${base}/${vaultName}/_security`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      admins: { names: ['admin'], roles: ['_admin'] },
      members: { names: [], roles: [] },
    }),
  });

  // Seed with starter notes
  const docs = getStarterNotes();
  await Promise.all(
    docs.map((doc) =>
      fetch(`${base}/${vaultName}/${encodeURIComponent(doc._id)}`, {
        method: 'PUT',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      })
    )
  );

  // Provision CouchDB user credentials for Obsidian LiveSync
  try {
    await provisionUserCredentials(userId);
  } catch (e) {
    console.warn(`[vault] credentials provisioning failed for ${userId}:`, e);
  }

  return { vaultName };
}

/**
 * Creates the user's primary vault only if it doesn't exist yet. Never call
 * createUserVault unconditionally per login — provisionUserCredentials inside
 * it rotates the user's LiveSync password on every invocation.
 */
export async function ensureUserVault(userId: string): Promise<void> {
  const res = await fetch(`${COUCHDB_INTERNAL_URL}/${getUserVaultName(userId)}`, {
    method: 'HEAD',
    headers: { Authorization: adminAuthHeader() },
  });
  if (res.status === 404) {
    await createUserVault(userId);
  }
}

export async function createSharedVault(
  name: string,
  creatorUserId: string
): Promise<{ vaultId: string; vaultName: string }> {
  const vaultId = `vault-shared-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const base = COUCHDB_INTERNAL_URL;
  const auth = adminAuthHeader();

  // Create the database
  const createRes = await fetch(`${base}/${vaultId}`, {
    method: 'PUT',
    headers: { Authorization: auth },
  });
  if (!createRes.ok && createRes.status !== 412) {
    const body = await createRes.text();
    throw new Error(`Failed to create shared vault: ${createRes.status} ${body}`);
  }

  // Lock down — only admin can access directly
  await fetch(`${base}/${vaultId}/_security`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      admins: { names: ['admin'], roles: ['_admin'] },
      members: { names: [], roles: [] },
    }),
  });

  // Store display metadata inside the vault
  await fetch(`${base}/${vaultId}/rexform-metadata`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      _id: 'rexform-metadata',
      vaultName: name,
      createdBy: creatorUserId,
      createdAt: Date.now(),
    }),
  });

  // Seed with starter notes
  const docs = getStarterNotes();
  await Promise.all(
    docs.map((doc) =>
      fetch(`${base}/${vaultId}/${encodeURIComponent(doc._id)}`, {
        method: 'PUT',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(doc),
      })
    )
  );

  // Grant creator owner access in Keto and sync _security
  try {
    const { grantVaultAccess } = await import('./keto');
    await grantVaultAccess(vaultId, creatorUserId, 'owner' as VaultRole);
    await syncVaultSecurity(vaultId);
  } catch (e) {
    console.warn(`[vault] Keto owner grant failed for ${vaultId}:`, e);
  }

  return { vaultId, vaultName: name };
}

function slugifyVaultName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  return slug || 'vault';
}

export async function countPersonalVaults(userId: string): Promise<number> {
  const res = await fetch(`${COUCHDB_INTERNAL_URL}/_all_dbs`, {
    headers: { Authorization: adminAuthHeader() },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to list databases: ${res.status}`);
  const dbs: string[] = await res.json();
  const prefix = getPersonalVaultPrefix(userId);
  return dbs.filter((db) => db.startsWith(prefix)).length;
}

/**
 * Creates an additional personal vault for a user. Reuses the shared-vault
 * machinery (Keto owner tuple + isolated CouchDB DB) with nobody else invited.
 * DB name: uvault-<userId>-<slug>; display name lives in rexform-metadata.
 */
export async function createPersonalVault(
  userId: string,
  name: string,
  template: 'blank' | 'starter' = 'starter'
): Promise<{ vaultId: string; vaultName: string }> {
  const base = COUCHDB_INTERNAL_URL;
  const auth = adminAuthHeader();
  const prefix = getPersonalVaultPrefix(userId);

  // Try the plain slug first; on collision retry with a random suffix
  let vaultId = `${prefix}${slugifyVaultName(name)}`;
  for (let attempt = 0; ; attempt++) {
    const createRes = await fetch(`${base}/${vaultId}`, {
      method: 'PUT',
      headers: { Authorization: auth },
    });
    if (createRes.ok) break;
    if (createRes.status === 412 && attempt < 3) {
      vaultId = `${prefix}${slugifyVaultName(name)}-${crypto.randomUUID().slice(0, 6)}`;
      continue;
    }
    const body = await createRes.text();
    throw new Error(`Failed to create vault: ${createRes.status} ${body}`);
  }

  // Lock down — only admin can access directly
  await fetch(`${base}/${vaultId}/_security`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      admins: { names: ['admin'], roles: ['_admin'] },
      members: { names: [], roles: [] },
    }),
  });

  // Display metadata (rename updates this doc, never the DB name)
  await fetch(`${base}/${vaultId}/rexform-metadata`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      _id: 'rexform-metadata',
      vaultName: name,
      kind: 'personal',
      createdBy: userId,
      createdAt: Date.now(),
    }),
  });

  if (template === 'starter') {
    const docs = getStarterNotes();
    await Promise.all(
      docs.map((doc) =>
        fetch(`${base}/${vaultId}/${encodeURIComponent(doc._id)}`, {
          method: 'PUT',
          headers: { Authorization: auth, 'Content-Type': 'application/json' },
          body: JSON.stringify(doc),
        })
      )
    );
  }

  // Owner tuple in Keto + _security member sync (grants LiveSync creds access)
  try {
    const { grantVaultAccess } = await import('./keto');
    await grantVaultAccess(vaultId, userId, 'owner' as VaultRole);
    await syncVaultSecurity(vaultId);
  } catch (e) {
    console.warn(`[vault] Keto owner grant failed for ${vaultId}:`, e);
  }

  return { vaultId, vaultName: name };
}

/** Renames a personal vault by updating its metadata doc (DB name is immutable). */
export async function renamePersonalVault(vaultId: string, newName: string): Promise<void> {
  const base = COUCHDB_INTERNAL_URL;
  const auth = adminAuthHeader();
  const getRes = await fetch(`${base}/${vaultId}/rexform-metadata`, {
    headers: { Authorization: auth },
    cache: 'no-store',
  });
  const existing = getRes.ok ? await getRes.json() : { _id: 'rexform-metadata' };
  const putRes = await fetch(`${base}/${vaultId}/rexform-metadata`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...existing, vaultName: newName }),
  });
  if (!putRes.ok) {
    throw new Error(`Failed to rename vault: ${putRes.status} ${await putRes.text()}`);
  }
}

/** Deletes a personal vault: revokes all Keto tuples, then drops the CouchDB DB. */
export async function deletePersonalVault(vaultId: string): Promise<void> {
  try {
    const { getVaultMembers, revokeVaultAccess } = await import('./keto');
    const members = await getVaultMembers(vaultId);
    await Promise.all(members.map((m) => revokeVaultAccess(vaultId, m.userId, m.role)));
  } catch (e) {
    console.warn(`[vault] Keto cleanup failed for ${vaultId}:`, e);
  }

  const res = await fetch(`${COUCHDB_INTERNAL_URL}/${vaultId}`, {
    method: 'DELETE',
    headers: { Authorization: adminAuthHeader() },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Failed to delete vault: ${res.status} ${await res.text()}`);
  }
}
