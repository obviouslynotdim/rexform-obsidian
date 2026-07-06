import crypto from 'crypto';

// Per-user GitLab connection, stored as a `rexform-gitlab` doc in the user's
// own vault DB (same admin-auth pattern as /api/user/plugins). The personal
// access token is AES-256-GCM encrypted at rest with a key derived from
// NEXTAUTH_SECRET and is only ever decrypted server-side — API routes proxy
// GitLab; the browser never sees the token after entry.

const COUCHDB_URL =
  process.env.COUCHDB_URL || process.env.COUCHDB_INTERNAL_URL || 'http://localhost:5984';
const ADMIN_USER =
  process.env.COUCHDB_ADMIN_USER || process.env.COUCHDB_USERNAME || 'admin';
const ADMIN_PASS =
  process.env.COUCHDB_ADMIN_PASSWORD || process.env.COUCHDB_PASSWORD || '';

const DOC_ID = 'rexform-gitlab';

function adminAuth() {
  return 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
}

function encryptionKey(): Buffer {
  return crypto
    .createHash('sha256')
    .update(process.env.NEXTAUTH_SECRET || 'rexform-dev-secret')
    .digest();
}

export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [
    iv.toString('base64'),
    enc.toString('base64'),
    cipher.getAuthTag().toString('base64'),
  ].join('.');
}

export function decryptToken(stored: string): string | null {
  try {
    const [ivB64, dataB64, tagB64] = stored.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/** Trim, force https:// when no protocol given, drop trailing slashes. */
export function normalizeHost(raw: string): string {
  let host = (raw || '').trim().replace(/\/+$/, '');
  if (!host) return 'https://gitlab.com';
  if (!/^https?:\/\//i.test(host)) host = `https://${host}`;
  return host;
}

export interface GitLabConfig {
  host: string;
  token: string;
  username: string;
}

function docUrl(userId: string) {
  return `${COUCHDB_URL}/vault-${userId}/${DOC_ID}`;
}

export async function loadGitLabConfig(userId: string): Promise<GitLabConfig | null> {
  const res = await fetch(docUrl(userId), {
    headers: { Authorization: adminAuth() },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const doc = await res.json();
  const token = typeof doc.token === 'string' ? decryptToken(doc.token) : null;
  if (!token || typeof doc.host !== 'string') return null;
  return { host: doc.host, token, username: doc.username ?? '' };
}

export async function saveGitLabConfig(
  userId: string,
  host: string,
  token: string,
  username: string
): Promise<void> {
  const url = docUrl(userId);
  let rev: string | undefined;
  try {
    const existing = await fetch(url, { headers: { Authorization: adminAuth() }, cache: 'no-store' });
    if (existing.ok) rev = (await existing.json())._rev;
  } catch {}

  const body: Record<string, unknown> = {
    _id: DOC_ID,
    host,
    token: encryptToken(token),
    username,
  };
  if (rev) body._rev = rev;

  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: adminAuth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.reason || `CouchDB error: ${res.status}`);
  }
}

export async function deleteGitLabConfig(userId: string): Promise<void> {
  const url = docUrl(userId);
  const existing = await fetch(url, { headers: { Authorization: adminAuth() }, cache: 'no-store' });
  if (!existing.ok) return;
  const doc = await existing.json();
  await fetch(`${url}?rev=${doc._rev}`, {
    method: 'DELETE',
    headers: { Authorization: adminAuth() },
  });
}

/** Proxy a GET to the GitLab REST API. Throws with GitLab's message on error. */
export async function gitlabFetch(config: GitLabConfig, path: string): Promise<any> {
  const res = await fetch(`${config.host}/api/v4${path}`, {
    headers: { 'PRIVATE-TOKEN': config.token },
    cache: 'no-store',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const msg = data.message || data.error || `GitLab error: ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return res.json();
}
