import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchFromVault, getAllNotes, isVaultNote, isFolderMarker, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const auth: AuthHeaders | undefined = session.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;
  const { db, canWrite } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
  if (!canWrite) return NextResponse.json({ error: 'Read-only vault' }, { status: 403 });

  const path = (req.nextUrl.searchParams.get('path') || '').trim().replace(/^\/+|\/+$/g, '');
  if (!path) return NextResponse.json({ error: 'path is required' }, { status: 400 });

  const data = await getAllNotes(auth, db);
  const affected = (data.rows as { doc: any }[])
    .map((r) => r.doc)
    .filter((doc: any) => isVaultNote(doc) || isFolderMarker(doc))
    .filter((doc: any) => (doc.path || doc._id).startsWith(path + '/'));

  let deleted = 0;
  for (const note of affected) {
    // Notes have chunks; markers do not — the empty children array handles both cases
    const children: string[] = Array.isArray(note.children) ? note.children : [];

    await Promise.all(children.map(async (cId: string) => {
      const r = await fetchFromVault(encodeURIComponent(cId), {}, auth, db);
      if (!r.ok) return;
      const chunk = await r.json();
      await fetchFromVault(`${encodeURIComponent(cId)}?rev=${chunk._rev}`, { method: 'DELETE' }, auth, db);
    }));

    await fetchFromVault(`${encodeURIComponent(note._id)}?rev=${note._rev}`, { method: 'DELETE' }, auth, db);
    deleted++;
  }

  return NextResponse.json({ deleted });
}
