import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchFromVault, isVaultNote, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

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

  return NextResponse.json({ id: newId });
}
