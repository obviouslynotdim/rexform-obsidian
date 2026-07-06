import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchFromVault, isVaultNote, isFolderMarker, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';
import { updatePathBacklinks, type PathPair } from '@/lib/wikilink-rewrite';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auth: AuthHeaders | undefined = session.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;
  const { db, canWrite } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
  if (!canWrite) {
    return NextResponse.json({ error: 'Read-only vault' }, { status: 403 });
  }

  let source: string, target: string;
  try {
    ({ source, target } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const cleanSource = (source || '').trim().replace(/^\/+|\/+$/g, '');
  const cleanTarget = (target || '').trim().replace(/^\/+|\/+$/g, '');

  if (!cleanSource) return NextResponse.json({ error: 'source is required' }, { status: 400 });

  const folderName = cleanSource.split('/').pop()!;
  const newPath = cleanTarget ? `${cleanTarget}/${folderName}` : folderName;

  if (newPath === cleanSource) return NextResponse.json({ moved: 0 });
  if (newPath.startsWith(cleanSource + '/')) {
    return NextResponse.json({ error: 'Cannot move a folder into itself or a descendant' }, { status: 400 });
  }

  // Fetch all docs
  const allDocsRes = await fetchFromVault('_all_docs?include_docs=true&limit=5000', {}, auth, db);
  if (!allDocsRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
  const allData = await allDocsRes.json();
  const allRows: any[] = (allData.rows as any[]).map((r: any) => r.doc).filter(Boolean);

  const affectedNotes = allRows
    .filter(isVaultNote)
    .filter((doc: any) => doc._id.startsWith(cleanSource + '/'));

  const affectedMarkers = allRows
    .filter(isFolderMarker)
    .filter((doc: any) => doc._id.startsWith(cleanSource + '/'));

  let moved = 0;
  const movedPairs: PathPair[] = [];

  // Move notes: copy note + chunks to new path, delete originals
  for (const note of affectedNotes) {
    const oldId: string = note._id;
    const newId = newPath + oldId.slice(cleanSource.length);
    const children: string[] = Array.isArray(note.children) ? note.children : [];

    const chunks = (await Promise.all(
      children.map(async (cId: string) => {
        const r = await fetchFromVault(encodeURIComponent(cId), {}, auth, db);
        return r.ok ? r.json() : null;
      })
    )).filter(Boolean);

    const newChildren = children.map((cId: string) => newId + cId.slice(oldId.length));

    await Promise.all(chunks.map(async (chunk: any, i: number) => {
      const { _rev: _, ...rest } = chunk;
      await fetchFromVault(
        encodeURIComponent(newChildren[i]),
        { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rest, _id: newChildren[i] }) },
        auth, db
      );
    }));

    const { _rev: __, ...noteRest } = note;
    const createRes = await fetchFromVault(
      encodeURIComponent(newId),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...noteRest, _id: newId, path: newId, children: newChildren, mtime: Date.now() }) },
      auth, db
    );
    if (!createRes.ok) continue;

    await Promise.all(chunks.map(async (chunk: any) => {
      await fetchFromVault(`${encodeURIComponent(chunk._id)}?rev=${chunk._rev}`, { method: 'DELETE' }, auth, db);
    }));
    await fetchFromVault(`${encodeURIComponent(oldId)}?rev=${note._rev}`, { method: 'DELETE' }, auth, db);
    movedPairs.push({ oldPath: oldId.replace(/\.md$/i, ''), newPath: newId.replace(/\.md$/i, '') });
    moved++;
  }

  // Move .keep markers (simple docs, no chunks)
  for (const marker of affectedMarkers) {
    const oldId: string = marker._id;
    const newId = newPath + oldId.slice(cleanSource.length);
    const { _rev: _, ...rest } = marker;
    const createRes = await fetchFromVault(
      encodeURIComponent(newId),
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rest, _id: newId, path: newId }) },
      auth, db
    );
    if (createRes.ok) {
      await fetchFromVault(`${encodeURIComponent(oldId)}?rev=${marker._rev}`, { method: 'DELETE' }, auth, db);
    }
  }

  // Delete .keep marker in the target folder if it exists (it now has content)
  if (cleanTarget) {
    try {
      const keepId = `${cleanTarget}/.keep`;
      const keepRes = await fetchFromVault(encodeURIComponent(keepId), {}, auth, db);
      if (keepRes.ok) {
        const keepDoc = await keepRes.json();
        if (keepDoc.rexform_marker) {
          await fetchFromVault(`${encodeURIComponent(keepId)}?rev=${keepDoc._rev}`, { method: 'DELETE' }, auth, db);
        }
      }
    } catch { /* non-critical */ }
  }

  // If the source folder's parent is now empty, create a .keep so it stays visible
  const sourceParent = cleanSource.split('/').slice(0, -1).join('/');
  if (sourceParent) {
    try {
      const remainingInParent = allRows.filter((doc: any) => {
        if (!isVaultNote(doc) && !isFolderMarker(doc)) return false;
        if (!doc._id.startsWith(sourceParent + '/')) return false;
        if (doc._id.startsWith(cleanSource + '/')) return false; // was just moved
        return true;
      });
      if (remainingInParent.length === 0) {
        const keepId = `${sourceParent}/.keep`;
        await fetchFromVault(
          encodeURIComponent(keepId),
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _id: keepId, rexform_marker: true, path: keepId }) },
          auth, db
        );
      }
    } catch { /* non-critical */ }
  }

  // Best-effort: rewrite [[old-path/Note]] path-qualified wikilinks across the
  // vault so they keep resolving. Fired un-awaited so it never blocks the
  // response; the move itself already succeeded.
  void updatePathBacklinks(movedPairs, auth, db).catch(() => {});

  return NextResponse.json({ moved });
}
