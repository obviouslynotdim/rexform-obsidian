// Registry of users who signed in via the central REXFORM IAM (rexform-sso).
// They have no local Kratos identity — the only moment their profile (email,
// name) is visible to this app is during the OAuth sign-in, so it's persisted
// here for the admin panel. One doc per user in a dedicated CouchDB database.

const COUCHDB_URL =
  process.env.COUCHDB_URL || process.env.COUCHDB_INTERNAL_URL || 'http://localhost:5984';
const COUCHDB_ADMIN_USER =
  process.env.COUCHDB_ADMIN_USER || process.env.COUCHDB_USERNAME || 'admin';
const COUCHDB_ADMIN_PASSWORD =
  process.env.COUCHDB_ADMIN_PASSWORD || process.env.COUCHDB_PASSWORD || '';

const REGISTRY_DB = 'rexform-sso-users';

function adminAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${COUCHDB_ADMIN_USER}:${COUCHDB_ADMIN_PASSWORD}`).toString('base64');
}

export interface SsoUserRecord {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: string;
  lastLoginAt: string;
}

async function ensureRegistryDb(): Promise<void> {
  const res = await fetch(`${COUCHDB_URL}/${REGISTRY_DB}`, {
    method: 'PUT',
    headers: { Authorization: adminAuthHeader() },
  });
  if (!res.ok && res.status !== 412) {
    throw new Error(`Failed to create ${REGISTRY_DB}: ${res.status}`);
  }
}

export async function upsertSsoUser(
  userId: string,
  email: string | null,
  name: string | null
): Promise<void> {
  await ensureRegistryDb();
  const auth = adminAuthHeader();
  const docUrl = `${COUCHDB_URL}/${REGISTRY_DB}/${encodeURIComponent(userId)}`;

  const existingRes = await fetch(docUrl, {
    headers: { Authorization: auth },
    cache: 'no-store',
  });
  const existing = existingRes.ok ? await existingRes.json() : null;

  const now = new Date().toISOString();
  const doc = {
    _id: userId,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    email: email ?? existing?.email ?? null,
    name: name ?? existing?.name ?? null,
    createdAt: existing?.createdAt ?? now,
    lastLoginAt: now,
  };

  const putRes = await fetch(docUrl, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(doc),
  });
  if (!putRes.ok && putRes.status !== 409) {
    throw new Error(`Failed to upsert SSO user ${userId}: ${putRes.status}`);
  }
}

export async function listSsoUsers(): Promise<SsoUserRecord[]> {
  try {
    const res = await fetch(`${COUCHDB_URL}/${REGISTRY_DB}/_all_docs?include_docs=true`, {
      headers: { Authorization: adminAuthHeader() },
      cache: 'no-store',
    });
    if (!res.ok) return []; // 404 = no SSO user has ever logged in
    const data = await res.json();
    return (data.rows ?? [])
      .map((r: any) => r.doc)
      .filter(Boolean)
      .map((d: any) => ({
        id: d._id,
        email: d.email ?? null,
        name: d.name ?? null,
        createdAt: d.createdAt ?? null,
        lastLoginAt: d.lastLoginAt ?? null,
      }));
  } catch {
    return [];
  }
}
