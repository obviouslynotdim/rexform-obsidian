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
