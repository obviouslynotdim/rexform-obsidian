import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllNotes, isVaultNote, assembleNoteContent, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

const WIKILINK_RE = /\[\[([^\[\]\n]+)\]\]/g;

function resolveWikilinkToId(name: string, docs: any[]): string | null {
  const lower = name.toLowerCase();
  const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, ' ');
  const lowerNorm = norm(lower);
  for (const doc of docs) {
    const path: string = doc.path || doc._id;
    const filename = path.split('/').pop()?.replace(/\.md$/i, '') ?? '';
    if (filename.toLowerCase() === lower) return doc._id;
    if (norm(filename) === lowerNorm) return doc._id;
    if (path.replace(/\.md$/i, '').toLowerCase() === lower) return doc._id;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;

  try {
    const sp = req.nextUrl.searchParams;
    const { db } = await resolveVault(session, sp.get('vault'));
    const data = await getAllNotes(auth, db);

    const allDocs = (data.rows as { doc: any }[])
      .map(r => r.doc)
      .filter(isVaultNote);

    // Optional folder scope: only include notes within the given folder path.
    const folderParam = sp.get('folder');
    const docs = folderParam
      ? allDocs.filter((doc: any) => {
          const p: string = doc.path || doc._id;
          return p === folderParam || p.startsWith(folderParam + '/');
        })
      : allDocs;

    const contents = await Promise.all(
      docs.map((doc: any) => assembleNoteContent(doc, auth, db).catch(() => ''))
    );

    const linkCounts: Record<string, number> = {};
    docs.forEach((doc: any) => { linkCounts[doc._id] = 0; });

    const edges: { source: string; target: string }[] = [];
    const seenEdges = new Set<string>();

    docs.forEach((doc: any, i: number) => {
      const body = contents[i] || '';
      const matches: string[] = [];
      let m: RegExpExecArray | null;
      const re = new RegExp(WIKILINK_RE.source, 'g');
      while ((m = re.exec(body)) !== null) matches.push(m[1].trim());

      for (const name of matches) {
        const targetId = resolveWikilinkToId(name, docs);
        if (!targetId || targetId === doc._id) continue;
        const edgeKey = [doc._id, targetId].sort().join('|||');
        if (seenEdges.has(edgeKey)) continue;
        seenEdges.add(edgeKey);
        edges.push({ source: doc._id, target: targetId });
        linkCounts[doc._id] = (linkCounts[doc._id] || 0) + 1;
        linkCounts[targetId] = (linkCounts[targetId] || 0) + 1;
      }
    });

    const nodes = docs.map((doc: any) => ({
      id: doc._id as string,
      path: (doc.path as string) || doc._id,
      title: ((doc.path as string) || doc._id).split('/').pop()?.replace(/\.md$/i, '') ?? doc._id,
      linkCount: linkCounts[doc._id] || 0,
    }));

    return NextResponse.json({ nodes, edges });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
