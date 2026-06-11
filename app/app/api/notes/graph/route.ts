import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllNotes, isVaultNote, AuthHeaders } from '@/lib/couchdb';
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
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;

  try {
    const { db } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
    const data = await getAllNotes(auth, db);

    const docs = (data.rows as { doc: any }[])
      .map(r => r.doc)
      .filter(isVaultNote);

    const linkCounts: Record<string, number> = {};
    docs.forEach((doc: any) => { linkCounts[doc._id] = 0; });

    const edges: { source: string; target: string }[] = [];
    const seenEdges = new Set<string>();

    docs.forEach((doc: any) => {
      const body: string = doc.body || doc.content || doc.text || '';
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
      title:
        ((doc.path as string) || doc._id)
          .split('/')
          .pop()
          ?.replace(/\.md$/i, '') ?? doc._id,
      linkCount: linkCounts[doc._id] || 0,
    }));

    return NextResponse.json({ nodes, edges });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
