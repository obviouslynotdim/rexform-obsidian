import type { Session } from 'next-auth';
import { isAdminUser, getUserVaultName, getAdminVaultName, createUserVault } from './vault';
import { getAvailableVaults, type VaultOption } from './active-vault';
import { stripFrontmatter } from './frontmatter';

// Re-export the dependency-free frontmatter helpers so they remain part of
// couchdb's public API while staying safe to import from client components.
export {
  parseFrontmatter,
  serializeFrontmatter,
  combineFrontmatter,
  stripFrontmatter,
  type Frontmatter,
  type FrontmatterValue,
} from './frontmatter';

const PROXY_URL = process.env.COUCHDB_PROXY_URL;
const DIRECT_URL = process.env.COUCHDB_URL;
const DIRECT_USER = process.env.COUCHDB_USERNAME;
const DIRECT_PASS = process.env.COUCHDB_PASSWORD;
const DB = process.env.COUCHDB_DATABASE || 'obsidian';

// Prefer public URL for admin operations — Railway internal hostname rejects Basic auth.
const INTERNAL_URL = DIRECT_URL || process.env.COUCHDB_INTERNAL_URL;
const ADMIN_USER = process.env.COUCHDB_ADMIN_USER || DIRECT_USER;
const ADMIN_PASS = process.env.COUCHDB_ADMIN_PASSWORD || DIRECT_PASS;

function directAuthHeader() {
  return 'Basic ' + Buffer.from(`${DIRECT_USER}:${DIRECT_PASS}`).toString('base64');
}

function adminAuthHeader() {
  return 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
}

export type AuthHeaders = { authorization?: string; cookie?: string };

/**
 * Returns the CouchDB database name for the given session.
 * Admin user → "obsidian". Everyone else → "vault-[userId]".
 */
export function getUserVault(session: Session | null): string {
  const userId = session?.user?.id;
  if (!userId) return getAdminVaultName();
  if (isAdminUser(userId)) return getAdminVaultName();
  return getUserVaultName(userId);
}

/**
 * Fetch from CouchDB.
 *
 * Write operations (PUT/POST/DELETE/PATCH) always bypass Oathkeeper and use
 * admin credentials directly — session auth is already validated at the Next.js
 * API layer, and Kratos bearer tokens can expire without invalidating the
 * NextAuth session (which would silently break all writes via Oathkeeper).
 *
 * Read operations on user vaults: direct admin credentials (bypass Oathkeeper).
 * Read operations on the admin vault: proxied through Oathkeeper in production.
 */
export async function fetchFromVault(
  dbRelativePath: string,
  options?: RequestInit,
  auth?: AuthHeaders,
  database?: string
): Promise<Response> {
  const db = database || DB;
  const method = ((options?.method as string) ?? 'GET').toUpperCase();
  const isWrite = ['PUT', 'POST', 'DELETE', 'PATCH'].includes(method);

  // Writes + user vaults: bypass Oathkeeper, use admin credentials directly
  if (isWrite || (database && database !== DB)) {
    const url = `${INTERNAL_URL}/${db}/${dbRelativePath}`;
    const opts: RequestInit = {
      ...options,
      headers: {
        Authorization: adminAuthHeader(),
        ...(options?.headers as Record<string, string>),
      },
      cache: 'no-store',
    };
    const res = await fetch(url, opts);

    // Auto-provision missing user vault on first access
    if (res.status === 404 && database && database !== DB) {
      const body = await res.clone().json().catch(() => ({}));
      if (body.reason === 'Database does not exist.') {
        const userId = database.replace(/^vault-/, '');
        console.log(`[couchdb] auto-provisioning missing vault for user ${userId}`);
        await createUserVault(userId);
        return fetch(url, opts);
      }
    }

    return res;
  }

  // Read requests to admin vault in production: route through Oathkeeper
  if (PROXY_URL) {
    const headers: Record<string, string> = {};
    if (auth?.authorization) headers['Authorization'] = auth.authorization;
    if (auth?.cookie) headers['Cookie'] = auth.cookie;
    return fetch(`${PROXY_URL}/${db}/${dbRelativePath}`, {
      ...options,
      headers: { ...headers, ...(options?.headers as Record<string, string>) },
      cache: 'no-store',
    });
  }

  // Local dev: direct Basic Auth (no Oathkeeper required)
  return fetch(`${DIRECT_URL}/${db}/${dbRelativePath}`, {
    ...options,
    headers: {
      Authorization: directAuthHeader(),
      ...(options?.headers as Record<string, string>),
    },
    cache: 'no-store',
  });
}

export function isPageDoc(doc: any): boolean {
  return (
    doc &&
    !doc._deleted &&
    !doc._id.startsWith('_design/') &&
    !doc._id.startsWith('h:') &&
    !!doc.path
  );
}

export function isFolderMarker(doc: any): boolean {
  if (!doc || doc._deleted) return false;
  return typeof doc._id === 'string' && doc._id.endsWith('/.keep');
}

export function isVaultNote(doc: any): boolean {
  if (!doc || doc._deleted) return false;
  const id: string = doc._id;
  if (id.startsWith('docs/')) return false;
  if (id.startsWith('node_modules/')) return false;
  if (id.startsWith('h:')) return false;
  if (id.startsWith('_')) return false;
  if (id === 'rexform-metadata') return false;
  if (id === 'rexform-plugins') return false;
  if (id === 'rexform-settings') return false;
  if (id.endsWith('/.keep')) return false;
  return doc.type === 'plain' || (typeof doc.path === 'string' && doc.path.endsWith('.md'));
}

export function extractTitle(doc: any): string {
  if (doc.title) return doc.title;
  const filename = (doc.path as string).split('/').pop() || doc.path;
  return filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}

export function buildPreview(doc: any): string {
  const folder = (doc.path as string).split('/').slice(0, -1).join('/');
  const blockCount: number = Array.isArray(doc.children) ? doc.children.length : 0;
  const mtime: string = doc.mtime
    ? new Date(doc.mtime).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';
  return [
    folder ? `📁 ${folder}` : null,
    blockCount ? `${blockCount} block${blockCount !== 1 ? 's' : ''}` : null,
    mtime ? `Modified ${mtime}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

export async function getAllNotes(auth?: AuthHeaders, database?: string) {
  const res = await fetchFromVault('_all_docs?include_docs=true&limit=1000', {}, auth, database);
  if (!res.ok) throw new Error(`CouchDB error: ${res.status}`);
  return res.json();
}

export async function getNote(id: string, auth?: AuthHeaders, database?: string) {
  const res = await fetchFromVault(encodeURIComponent(id), {}, auth, database);
  if (!res.ok) throw new Error(`Note not found: ${res.status}`);
  return res.json();
}

export async function assembleNoteContent(
  doc: any,
  auth?: AuthHeaders,
  database?: string
): Promise<string> {
  const children: string[] = Array.isArray(doc.children) ? doc.children : [];
  if (children.length === 0) return doc.body || doc.content || doc.text || '';

  const chunks = await Promise.all(
    children.map(async (chunkId: string) => {
      try {
        const res = await fetchFromVault(encodeURIComponent(chunkId), {}, auth, database);
        if (!res.ok) return '';
        const chunk = await res.json();
        return chunk.data || '';
      } catch {
        return '';
      }
    })
  );

  return chunks.join('');
}

async function getContentPreview(
  doc: any,
  auth?: AuthHeaders,
  database?: string
): Promise<string> {
  const children: string[] = Array.isArray(doc.children) ? doc.children : [];
  if (children.length === 0) return '';
  try {
    const res = await fetchFromVault(encodeURIComponent(children[0]), {}, auth, database);
    if (!res.ok) return '';
    const chunk = await res.json();
    const { content } = stripFrontmatter(chunk.data || '');
    return content
      .replace(/[#*`>\[\]!]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 150);
  } catch {
    return '';
  }
}

export async function getDashboardData(auth?: AuthHeaders, database?: string) {
  const data = await getAllNotes(auth, database);
  const rows = data.rows || [];
  const notes = rows
    .map((r: any) => r.doc)
    .filter(isVaultNote)
    .sort((a: any, b: any) => (b.mtime ?? 0) - (a.mtime ?? 0));

  const recentNotes = await Promise.all(
    notes.slice(0, 8).map(async (doc: any) => ({
      _id: doc._id,
      title: extractTitle(doc),
      preview: await getContentPreview(doc, auth, database),
    }))
  );

  return { total: notes.length, recentNotes };
}

async function getSharedVaultDisplayName(vaultId: string): Promise<string> {
  try {
    const auth = 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
    const res = await fetch(`${INTERNAL_URL}/${vaultId}/rexform-metadata`, {
      headers: { Authorization: auth },
      cache: 'no-store',
    });
    if (!res.ok) return vaultId;
    const data = await res.json();
    return data.vaultName || vaultId;
  } catch {
    return vaultId;
  }
}

/**
 * Returns all vaults the session user can access: their personal vault plus any
 * shared vaults granted via Keto. Falls back gracefully if Keto is not configured.
 */
export async function getAccessibleVaults(session: Session | null): Promise<VaultOption[]> {
  const personal = getAvailableVaults(session);
  if (!session?.user?.id || !process.env.KETO_READ_URL) return personal;

  try {
    const { getUserSharedVaults } = await import('./keto');
    const shared = await getUserSharedVaults(session.user.id);
    const sharedOptions: VaultOption[] = await Promise.all(
      shared.map(async ({ vaultId, role }) => ({
        name: vaultId,
        label: await getSharedVaultDisplayName(vaultId),
        role,
      }))
    );
    return [...personal, ...sharedOptions];
  } catch (e) {
    console.error('[couchdb] getAccessibleVaults error:', e);
    return personal;
  }
}
