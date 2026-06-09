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

async function setConfig(section: string, key: string, value: string): Promise<void> {
  const auth = adminAuthHeader();
  // Try /_node/nonode@nohost/_config first (CouchDB 3.x), fall back to /_config
  for (const base of ['/_node/nonode@nohost/_config', '/_config']) {
    const res = await fetch(`${COUCHDB_INTERNAL_URL}${base}/${section}/${key}`, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
    if (res.ok) return;
    if (res.status !== 404) {
      console.warn(`[credentials] config ${base}/${section}/${key}: ${res.status}`);
      return;
    }
  }
}

/**
 * Configures CouchDB CORS so Obsidian LiveSync (browser/mobile) can connect.
 * Safe to call repeatedly — CouchDB returns 200 if value is already set.
 */
export async function configureCouchDbCors(): Promise<void> {
  try {
    await setConfig('httpd', 'enable_cors', 'true');
    await setConfig('cors', 'origins', '*');
    await setConfig('cors', 'credentials', 'true');
    await setConfig('cors', 'headers', 'accept, authorization, content-type, origin, referer');
    await setConfig('cors', 'methods', 'GET, PUT, POST, HEAD, DELETE');
    console.log('[credentials] CouchDB CORS configured');
  } catch (e) {
    console.warn('[credentials] CORS configuration failed:', e);
  }
}

async function ensureUsersDb(): Promise<void> {
  const auth = adminAuthHeader();
  const res = await fetch(`${COUCHDB_INTERNAL_URL}/_users`, {
    method: 'PUT',
    headers: { Authorization: auth },
  });
  // 201 = created, 412 = already exists — both are fine
  if (!res.ok && res.status !== 412) {
    const text = await res.text();
    console.warn(`[credentials] could not ensure _users db: ${res.status} ${text}`);
  }
  // Configure CORS at the same time — idempotent
  await configureCouchDbCors();
}

async function ensureVaultAccess(userId: string): Promise<void> {
  const auth = adminAuthHeader();
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
    const text = await secRes.text();
    console.error(`[credentials] _security update failed for ${vaultName}: ${secRes.status} ${text}`);
    throw new Error(`Could not grant vault access: ${secRes.status}`);
  }
}

export async function provisionUserCredentials(userId: string): Promise<CouchDbCredentials> {
  const password = generatePassword();
  const docId = `org.couchdb.user:${userId}`;
  const url = `${COUCHDB_INTERNAL_URL}/_users/${encodeURIComponent(docId)}`;
  const auth = adminAuthHeader();

  // Ensure _users db exists and CORS is configured
  await ensureUsersDb();

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
    livesync_password: password,
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

  // Grant vault access — throws if it fails so the caller knows
  await ensureVaultAccess(userId);

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

  // Re-confirm vault access on regeneration too
  await ensureVaultAccess(userId).catch((e) =>
    console.warn('[credentials] vault access re-check failed:', e.message)
  );

  return { username: userId, password };
}
