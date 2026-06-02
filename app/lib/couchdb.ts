import type { Session } from 'next-auth';
import { isAdminUser, getUserVaultName, getAdminVaultName } from './vault';

const PROXY_URL = process.env.COUCHDB_PROXY_URL;
const DIRECT_URL = process.env.COUCHDB_URL;
const DIRECT_USER = process.env.COUCHDB_USERNAME;
const DIRECT_PASS = process.env.COUCHDB_PASSWORD;
const DB = process.env.COUCHDB_DATABASE || 'obsidian';

const INTERNAL_URL = process.env.COUCHDB_INTERNAL_URL || DIRECT_URL;
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
 * For the admin vault (obsidian): routes through Oathkeeper in production (validates
 * the Kratos session token), falls back to direct Basic Auth in local dev.
 *
 * For user vaults (vault-<userId>): always uses the internal Railway URL with admin
 * credentials — the Next.js session is already validated server-side before this call.
 */
export async function fetchFromVault(
  dbRelativePath: string,
  options?: RequestInit,
  auth?: AuthHeaders,
  database?: string
): Promise<Response> {
  const db = database || DB;

  // User vaults bypass Oathkeeper — use internal admin credentials
  if (database && database !== DB) {
    return fetch(`${INTERNAL_URL}/${db}/${dbRelativePath}`, {
      ...options,
      headers: {
        Authorization: adminAuthHeader(),
        ...(options?.headers as Record<string, string>),
      },
      cache: 'no-store',
    });
  }

  // Admin vault in production: route through Oathkeeper with the caller's session token
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

export function stripFrontmatter(markdown: string): {
  content: string;
  frontmatter: Record<string, string>;
} {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { content: markdown, frontmatter: {} };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon > 0) {
      const key = line.slice(0, colon).trim();
      const val = line
        .slice(colon + 1)
        .trim()
        .replace(/^['"\[]|['"\]]$/g, '');
      frontmatter[key] = val;
    }
  }
  return { content: match[2].trim(), frontmatter };
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
  const res = await fetchFromVault('_all_docs?include_docs=true&limit=200', {}, auth, database);
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
  const pageDocs = rows.map((r: any) => r.doc).filter(isPageDoc);

  const recentNotes = await Promise.all(
    pageDocs.slice(0, 8).map(async (doc: any) => ({
      _id: doc._id,
      title: extractTitle(doc),
      preview: await getContentPreview(doc, auth, database),
    }))
  );

  return { total: pageDocs.length, recentNotes };
}
