import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchFromVault, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
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
  const id = decodeURIComponent(params.id);

  let content: string;
  try {
    ({ content } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const noteRes = await fetchFromVault(encodeURIComponent(id), {}, auth, db);
  if (!noteRes.ok) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  const note = await noteRes.json();
  const children: string[] = Array.isArray(note.children) ? note.children : [];
  const now = Date.now();

  if (children.length === 0) {
    const res = await fetchFromVault(
      encodeURIComponent(id),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...note, mtime: now, body: content }) },
      auth, db
    );
    if (!res.ok) return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  } else {
    const chunkId = children[0];
    const chunkRes = await fetchFromVault(encodeURIComponent(chunkId), {}, auth, db);
    if (!chunkRes.ok) return NextResponse.json({ error: 'Chunk not found' }, { status: 404 });
    const chunk = await chunkRes.json();
    const updateChunk = await fetchFromVault(
      encodeURIComponent(chunkId),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...chunk, data: content }) },
      auth, db
    );
    if (!updateChunk.ok) return NextResponse.json({ error: 'Chunk update failed' }, { status: 500 });
    const updateParent = await fetchFromVault(
      encodeURIComponent(id),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...note, mtime: now }) },
      auth, db
    );
    if (!updateParent.ok) return NextResponse.json({ error: 'Parent update failed' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
