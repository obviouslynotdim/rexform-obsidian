import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchFromVault, isVaultNote, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';
import { updatePathBacklinks } from '@/lib/wikilink-rewrite';

// Normalize a wikilink target the same way resolveWikilink does on the client:
// case-insensitive, hyphens/underscores treated as spaces.
function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[-_]/g, ' ').trim();
}

/**
 * Rewrites every `[[Old Name]]` wikilink in `content` to `[[New Name]]`.
 * Matches case-insensitively and treats hyphens/underscores as spaces, so
 * `[[old-name]]` is updated too. Preserves any `#heading` and `|alias` parts.
 * Returns the original string unchanged if nothing matched.
 */
function rewriteWikilinks(content: string, oldTitle: string, newTitle: string): string {
  const oldNorm = normalizeTitle(oldTitle);
  return content.replace(/\[\[([^\[\]\n]+)\]\]/g, (full, inner: string) => {
    const pipeIdx = inner.indexOf('|');
    const alias = pipeIdx >= 0 ? inner.slice(pipeIdx) : '';
    const beforeAlias = pipeIdx >= 0 ? inner.slice(0, pipeIdx) : inner;
    const hashIdx = beforeAlias.indexOf('#');
    const heading = hashIdx >= 0 ? beforeAlias.slice(hashIdx) : '';
    const name = hashIdx >= 0 ? beforeAlias.slice(0, hashIdx) : beforeAlias;
    if (normalizeTitle(name) === oldNorm) {
      return `[[${newTitle}${heading}${alias}]]`;
    }
    return full;
  });
}

/**
 * Best-effort backlink update: after a note is renamed, scan every other doc
 * in the vault and rewrite `[[Old Name]]` wikilinks to `[[New Name]]`.
 *
 * Content lives in chunk docs (the `data` field) for this app's notes, with a
 * fallback to inline `body`/`content`/`text` fields. Only docs whose content
 * actually changes are written back. Runs un-awaited so it never blocks the
 * rename response; any failure is swallowed (the rename already succeeded).
 */
async function updateBacklinks(
  oldTitle: string,
  newTitle: string,
  auth: AuthHeaders | undefined,
  db: string,
  skipIds: Set<string>
): Promise<void> {
  const allDocsRes = await fetchFromVault('_all_docs?include_docs=true&limit=5000', {}, auth, db);
  if (!allDocsRes.ok) return;
  const allData = await allDocsRes.json();
  const rows: any[] = Array.isArray(allData.rows) ? allData.rows : [];
  const contentFields = ['data', 'body', 'content', 'text'] as const;

  await Promise.all(
    rows.map(async (row) => {
      const doc = row.doc;
      if (!doc || doc._deleted) return;
      const id: string = doc._id;
      if (skipIds.has(id)) return;
      if (id.startsWith('_design/') || id.startsWith('_')) return;

      let changed = false;
      const updated: Record<string, unknown> = { ...doc };
      for (const field of contentFields) {
        const value = doc[field];
        if (typeof value !== 'string') continue;
        const rewritten = rewriteWikilinks(value, oldTitle, newTitle);
        if (rewritten !== value) {
          updated[field] = rewritten;
          changed = true;
        }
      }
      if (!changed) return;

      try {
        await fetchFromVault(
          encodeURIComponent(id),
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) },
          auth,
          db
        );
      } catch {
        // best-effort per doc — skip on conflict/error
      }
    })
  );
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auth: AuthHeaders | undefined = session.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;
  const { db, canWrite } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
  if (!canWrite) {
    return NextResponse.json({ error: 'Read-only access to this vault' }, { status: 403 });
  }

  const oldId = decodeURIComponent(params.id);

  let folder: string | undefined, name: string | undefined;
  try {
    ({ folder, name } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const oldFolder = oldId.split('/').slice(0, -1).join('/');
  const oldFilename = oldId.split('/').pop()!;

  const newFilename = name?.trim() ? `${name.trim()}.md` : oldFilename;
  const newFolder = folder !== undefined
    ? (folder || '').trim().replace(/^\/+|\/+$/g, '')
    : oldFolder;
  const newId = newFolder ? `${newFolder}/${newFilename}` : newFilename;

  if (newId === oldId) return NextResponse.json({ id: newId });

  // Check destination doesn't already exist
  const existsRes = await fetchFromVault(encodeURIComponent(newId), {}, auth, db);
  if (existsRes.ok) {
    return NextResponse.json({ error: `A note named "${newFilename}" already exists in that folder` }, { status: 409 });
  }

  // Fetch old note
  const noteRes = await fetchFromVault(encodeURIComponent(oldId), {}, auth, db);
  if (!noteRes.ok) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  const note = await noteRes.json();
  const children: string[] = Array.isArray(note.children) ? note.children : [];

  // Fetch all chunks
  const chunks = await Promise.all(
    children.map(async (chunkId: string) => {
      const res = await fetchFromVault(encodeURIComponent(chunkId), {}, auth, db);
      if (!res.ok) throw new Error(`Chunk not found: ${chunkId}`);
      return res.json();
    })
  );

  // Compute new chunk IDs (replace old path prefix with new)
  const newChildren = children.map((cId: string) => {
    const suffix = cId.slice(oldId.length); // e.g. "_c0"
    return newId + suffix;
  });

  // Create new chunks
  await Promise.all(
    chunks.map(async (chunk: any, i: number) => {
      const newChunkId = newChildren[i];
      const { _rev: _, ...rest } = chunk;
      await fetchFromVault(
        encodeURIComponent(newChunkId),
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rest, _id: newChunkId }) },
        auth,
        db
      );
    })
  );

  // Create new note doc
  const { _rev: __, ...noteRest } = note;
  const newNoteRes = await fetchFromVault(
    encodeURIComponent(newId),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...noteRest, _id: newId, path: newId, children: newChildren, mtime: Date.now(), ...(name?.trim() ? { title: name.trim() } : {}) }),
    },
    auth,
    db
  );
  if (!newNoteRes.ok) {
    const text = await newNoteRes.text();
    return NextResponse.json({ error: `Failed to create at new path: ${text}` }, { status: 500 });
  }

  // Delete .keep marker in newFolder if it exists (folder now has real content)
  if (newFolder) {
    try {
      const keepId = `${newFolder}/.keep`;
      const keepRes = await fetchFromVault(encodeURIComponent(keepId), {}, auth, db);
      if (keepRes.ok) {
        const keepDoc = await keepRes.json();
        if (keepDoc.rexform_marker) {
          await fetchFromVault(`${encodeURIComponent(keepId)}?rev=${keepDoc._rev}`, { method: 'DELETE' }, auth, db);
        }
      }
    } catch {
      // non-critical cleanup
    }
  }

  // Delete old chunks
  await Promise.all(
    chunks.map(async (chunk: any) => {
      await fetchFromVault(`${encodeURIComponent(chunk._id)}?rev=${chunk._rev}`, { method: 'DELETE' }, auth, db);
    })
  );

  // Delete old note
  await fetchFromVault(`${encodeURIComponent(oldId)}?rev=${note._rev}`, { method: 'DELETE' }, auth, db);

  // If oldFolder is now empty, create a .keep marker so the folder stays visible
  if (oldFolder && oldFolder !== newFolder) {
    try {
      const allDocsRes = await fetchFromVault('_all_docs?include_docs=true&limit=5000', {}, auth, db);
      if (allDocsRes.ok) {
        const allData = await allDocsRes.json();
        const remaining = (allData.rows as any[])
          .map((r: any) => r.doc)
          .filter((doc: any) => {
            if (!isVaultNote(doc)) return false;
            const docPath: string = doc.path || doc._id;
            const docFolder = docPath.split('/').slice(0, -1).join('/');
            return docFolder === oldFolder || docFolder.startsWith(oldFolder + '/');
          });
        if (remaining.length === 0) {
          const keepId = `${oldFolder}/.keep`;
          await fetchFromVault(
            encodeURIComponent(keepId),
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ _id: keepId, rexform_marker: true, path: keepId }),
            },
            auth,
            db
          );
        }
      }
    } catch {
      // non-critical: folder will simply disappear if marker creation fails
    }
  }

  // Best-effort: rewrite [[Old Name]] wikilinks across the vault so backlinks
  // survive the rename. Only meaningful when the filename (title) changed —
  // a pure folder move keeps the same title. Fired un-awaited so it doesn't
  // block the response; ctx.waitUntil isn't available in Next.js route handlers.
  const oldTitle = oldFilename.replace(/\.md$/i, '');
  const newTitle = newFilename.replace(/\.md$/i, '');
  if (normalizeTitle(oldTitle) !== normalizeTitle(newTitle)) {
    const skipIds = new Set<string>([newId, ...newChildren]);
    void updateBacklinks(oldTitle, newTitle, auth, db, skipIds).catch(() => {
      // best-effort — rename already succeeded
    });
  }

  // Same best-effort pass for path-qualified links ([[folder/Note]]) when the
  // note changed folders — bare-title links are covered above, so this helper
  // only touches links containing '/'.
  if (oldFolder !== newFolder) {
    void updatePathBacklinks(
      [{ oldPath: oldId.replace(/\.md$/i, ''), newPath: newId.replace(/\.md$/i, '') }],
      auth,
      db
    ).catch(() => {});
  }

  return NextResponse.json({ id: newId });
}
