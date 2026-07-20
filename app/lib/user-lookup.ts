// Resolving people across the two identity sources: local Kratos identities
// and SSO users (central IAM, known only via the rexform-sso-users registry).
// Used by shared-vault invitations (email → userId) and member display
// (userId → email).

import { kratosAdmin } from './kratos';
import { listSsoUsers } from './sso-users';

export interface ResolvedUser {
  userId: string;
  email: string | null;
}

const COUCHDB_URL =
  process.env.COUCHDB_URL || process.env.COUCHDB_INTERNAL_URL || 'http://localhost:5984';
const COUCHDB_ADMIN_USER =
  process.env.COUCHDB_ADMIN_USER || process.env.COUCHDB_USERNAME || 'admin';
const COUCHDB_ADMIN_PASSWORD =
  process.env.COUCHDB_ADMIN_PASSWORD || process.env.COUCHDB_PASSWORD || '';

function adminAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${COUCHDB_ADMIN_USER}:${COUCHDB_ADMIN_PASSWORD}`).toString('base64');
}

export async function findKratosByEmail(email: string): Promise<ResolvedUser | null> {
  try {
    const { data } = await kratosAdmin.listIdentities({ perPage: 500 });
    const hit = data.find(
      (i) => String((i.traits as any)?.email ?? '').toLowerCase() === email
    );
    return hit ? { userId: hit.id, email: (hit.traits as any).email } : null;
  } catch {
    return null; // Kratos admin unreachable (e.g. local dev) — fall through
  }
}

export async function findSsoByEmail(email: string): Promise<ResolvedUser | null> {
  const users = await listSsoUsers();
  const hit = users.find((u) => (u.email ?? '').toLowerCase() === email);
  return hit ? { userId: hit.id, email: hit.email } : null;
}

async function userIdExists(userId: string): Promise<boolean> {
  try {
    await kratosAdmin.getIdentity({ id: userId });
    return true;
  } catch {}
  try {
    const res = await fetch(`${COUCHDB_URL}/vault-${encodeURIComponent(userId)}`, {
      method: 'HEAD',
      headers: { Authorization: adminAuthHeader() },
    });
    if (res.ok) return true;
  } catch {}
  const sso = await listSsoUsers();
  return sso.some((u) => u.id === userId);
}

/**
 * Resolves an invitation target. Input with an '@' is treated as an email and
 * matched against Kratos identities, then the SSO registry; anything else is
 * treated as a raw userId and verified to exist (typo protection).
 */
export async function resolveUserIdentifier(input: string): Promise<ResolvedUser | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) {
    const needle = trimmed.toLowerCase();
    return (await findKratosByEmail(needle)) ?? (await findSsoByEmail(needle));
  }
  if (await userIdExists(trimmed)) {
    return { userId: trimmed, email: await getUserEmail(trimmed) };
  }
  return null;
}

/** Best-effort email for display: Kratos traits, then the SSO registry. */
export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { data } = await kratosAdmin.getIdentity({ id: userId });
    const email = (data.traits as any)?.email;
    if (email) return email;
  } catch {}
  try {
    const sso = await listSsoUsers();
    return sso.find((u) => u.id === userId)?.email ?? null;
  } catch {
    return null;
  }
}
