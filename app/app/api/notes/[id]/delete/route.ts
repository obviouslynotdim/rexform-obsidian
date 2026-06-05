import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchFromVault, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
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

  const noteRes = await fetchFromVault(encodeURIComponent(id), {}, auth, db);
  if (!noteRes.ok) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  const note = await noteRes.json();
  const children: string[] = Array.isArray(note.children) ? note.children : [];

  await Promise.all(
    children.map(async (chunkId: string) => {
      const res = await fetchFromVault(encodeURIComponent(chunkId), {}, auth, db);
      if (!res.ok) return;
      const chunk = await res.json();
      await fetchFromVault(`${encodeURIComponent(chunkId)}?rev=${chunk._rev}`, { method: 'DELETE' }, auth, db);
    })
  );

  await fetchFromVault(`${encodeURIComponent(id)}?rev=${note._rev}`, { method: 'DELETE' }, auth, db);
  return NextResponse.json({ success: true });
}
