import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchFromVault, AuthHeaders } from '@/lib/couchdb';
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

  let folder: string;
  try {
    ({ folder } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const sanitizedFolder = (folder || '').trim().replace(/^\/+|\/+$/g, '');
  const filename = oldId.split('/').pop()!;
  const newId = sanitizedFolder ? `${sanitizedFolder}/${filename}` : filename;

  if (newId === oldId) return NextResponse.json({ id: newId });

  // Check destination doesn't already exist
  const existsRes = await fetchFromVault(encodeURIComponent(newId), {}, auth, db);
  if (existsRes.ok) {
    return NextResponse.json({ error: `A note named "${filename}" already exists in that folder` }, { status: 409 });
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
      body: JSON.stringify({ ...noteRest, _id: newId, path: newId, children: newChildren, mtime: Date.now() }),
    },
    auth,
    db
  );
  if (!newNoteRes.ok) {
    const text = await newNoteRes.text();
    return NextResponse.json({ error: `Failed to create at new path: ${text}` }, { status: 500 });
  }

  // Delete old chunks
  await Promise.all(
    chunks.map(async (chunk: any) => {
      await fetchFromVault(`${encodeURIComponent(chunk._id)}?rev=${chunk._rev}`, { method: 'DELETE' }, auth, db);
    })
  );

  // Delete old note
  await fetchFromVault(`${encodeURIComponent(oldId)}?rev=${note._rev}`, { method: 'DELETE' }, auth, db);

  return NextResponse.json({ id: newId });
}
