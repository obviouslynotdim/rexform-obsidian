import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchFromVault, getAllNotes, isVaultNote, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';
import { updatePathBacklinks, type PathPair } from '@/lib/wikilink-rewrite';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const auth: AuthHeaders | undefined = session.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;
  const { db, canWrite } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
  if (!canWrite) return NextResponse.json({ error: 'Read-only vault' }, { status: 403 });

  let oldPath: string, newName: string;
  try {
    ({ oldPath, newName } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const trimOld = oldPath.trim().replace(/^\/+|\/+$/g, '');
  const trimNew = newName.trim().replace(/^\/+|\/+$/g, '');
  if (!trimOld || !trimNew) return NextResponse.json({ error: 'oldPath and newName are required' }, { status: 400 });

  // Build new folder path: keep all ancestors, replace last segment
  const parentSegments = trimOld.split('/').slice(0, -1);
  const newPath = [...parentSegments, trimNew].join('/');

  if (trimOld === newPath) return NextResponse.json({ renamed: 0 });

  const data = await getAllNotes(auth, db);
  const affected = (data.rows as { doc: any }[])
    .map((r) => r.doc)
    .filter(isVaultNote)
    .filter((doc: any) => (doc.path || doc._id).startsWith(trimOld + '/'));

  if (affected.length === 0) return NextResponse.json({ renamed: 0 });

  let renamed = 0;
  const errors: string[] = [];
  const movedPairs: PathPair[] = [];

  for (const note of affected) {
    const oldId: string = note._id;
    const newId = newPath + oldId.slice(trimOld.length); // replace prefix
    const children: string[] = Array.isArray(note.children) ? note.children : [];

    // Fetch chunks
    const chunks = await Promise.all(
      children.map(async (cId: string) => {
        const r = await fetchFromVault(encodeURIComponent(cId), {}, auth, db);
        return r.ok ? r.json() : null;
      })
    ).then((c) => c.filter(Boolean));

    const newChildren = children.map((cId: string) => newId + cId.slice(oldId.length));

    // Create new chunks
    await Promise.all(chunks.map(async (chunk: any, i: number) => {
      const { _rev: _, ...rest } = chunk;
      await fetchFromVault(
        encodeURIComponent(newChildren[i]),
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rest, _id: newChildren[i] }) },
        auth, db
      );
    }));

    // Create new note doc
    const { _rev: __, ...noteRest } = note;
    const createRes = await fetchFromVault(
      encodeURIComponent(newId),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...noteRest, _id: newId, path: newId, children: newChildren, mtime: Date.now() }) },
      auth, db
    );
    if (!createRes.ok) { errors.push(oldId); continue; }

    // Delete old chunks + old note
    await Promise.all(chunks.map(async (chunk: any) => {
      await fetchFromVault(`${encodeURIComponent(chunk._id)}?rev=${chunk._rev}`, { method: 'DELETE' }, auth, db);
    }));
    await fetchFromVault(`${encodeURIComponent(oldId)}?rev=${note._rev}`, { method: 'DELETE' }, auth, db);
    movedPairs.push({ oldPath: oldId.replace(/\.md$/i, ''), newPath: newId.replace(/\.md$/i, '') });
    renamed++;
  }

  // Best-effort: rewrite [[old-folder/Note]] path-qualified wikilinks across
  // the vault so they keep resolving. Fired un-awaited so it never blocks the
  // response; the rename itself already succeeded.
  void updatePathBacklinks(movedPairs, auth, db).catch(() => {});

  return NextResponse.json({ renamed, errors: errors.length ? errors : undefined });
}
