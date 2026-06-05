import crypto from 'crypto';

// Use public URL first — Railway internal hostname rejects Basic auth (same as vault.ts)
const COUCHDB_INTERNAL_URL =
  process.env.COUCHDB_URL || process.env.COUCHDB_INTERNAL_URL || 'http://localhost:5984';
const COUCHDB_ADMIN_USER =
  process.env.COUCHDB_ADMIN_USER || process.env.COUCHDB_USERNAME || 'admin';
const COUCHDB_ADMIN_PASSWORD =
  process.env.COUCHDB_ADMIN_PASSWORD || process.env.COUCHDB_PASSWORD || '';

function adminAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${COUCHDB_ADMIN_USER}:${COUCHDB_ADMIN_PASSWORD}`).toString('base64');
}

function generatePassword(): string {
  return crypto.randomBytes(16).toString('hex');
}

export interface CouchDbCredentials {
  username: string;
  password: string;
}

export async function provisionUserCredentials(userId: string): Promise<CouchDbCredentials> {
  const password = generatePassword();
  const docId = `org.couchdb.user:${userId}`;
  const url = `${COUCHDB_INTERNAL_URL}/_users/${encodeURIComponent(docId)}`;
  const auth = adminAuthHeader();

  // Get existing doc rev if user already exists
  let rev: string | undefined;
  const existing = await fetch(url, { headers: { Authorization: auth } });
  if (existing.ok) {
    const data = await existing.json();
    rev = data._rev;
  }

  const body: Record<string, unknown> = {
    _id: docId,
    name: userId,
    password,
    roles: [],
    type: 'user',
    livesync_password: password, // stored for later retrieval since CouchDB hashes the password field
  };
  if (rev) body._rev = rev;

  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[credentials] PUT _users failed for ${userId}: ${res.status} ${text}`);
    throw new Error(`Failed to provision CouchDB user: ${res.status} ${text}`);
  }

  // Grant this user direct access to their vault (for Obsidian LiveSync)
  const vaultName = `vault-${userId}`;
  const secRes = await fetch(`${COUCHDB_INTERNAL_URL}/${vaultName}/_security`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      admins: { names: ['admin'], roles: ['_admin'] },
      members: { names: [userId], roles: [] },
    }),
  });
  if (!secRes.ok) {
    console.warn(`[credentials] could not update _security for ${vaultName}: ${secRes.status}`);
  }

  return { username: userId, password };
}

export async function getUserCredentials(userId: string): Promise<CouchDbCredentials | null> {
  const docId = `org.couchdb.user:${userId}`;
  const url = `${COUCHDB_INTERNAL_URL}/_users/${encodeURIComponent(docId)}`;
  const res = await fetch(url, { headers: { Authorization: adminAuthHeader() } });
  if (!res.ok) {
    if (res.status !== 404) {
      console.error(`[credentials] GET _users failed for ${userId}: ${res.status}`);
    }
    return null;
  }
  const data = await res.json();
  if (!data.livesync_password) return null;
  return { username: userId, password: data.livesync_password };
}

export async function regenerateCredentials(userId: string): Promise<CouchDbCredentials> {
  const docId = `org.couchdb.user:${userId}`;
  const url = `${COUCHDB_INTERNAL_URL}/_users/${encodeURIComponent(docId)}`;
  const auth = adminAuthHeader();

  const existing = await fetch(url, { headers: { Authorization: auth } });
  if (!existing.ok) {
    // User doesn't exist yet — provision fresh
    return provisionUserCredentials(userId);
  }

  const data = await existing.json();
  const password = generatePassword();

  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, password, livesync_password: password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to regenerate credentials: ${res.status} ${text}`);
  }

  return { username: userId, password };
}
