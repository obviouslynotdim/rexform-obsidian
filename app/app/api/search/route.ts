import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllNotes, isPageDoc, extractTitle, stripFrontmatter, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

function extractSnippet(text: string, query: string): string {
  const clean = text.replace(/^---[\s\S]*?---\n?/, '').replace(/[#*`>\[\]!]/g, '').replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return clean.slice(0, 120);
  const start = Math.max(0, idx - 50);
  const end = Math.min(clean.length, idx + query.length + 70);
  return (start > 0 ? '…' : '') + clean.slice(start, end) + (end < clean.length ? '…' : '');
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;

  if (!q) return NextResponse.json({ results: [] });

  try {
    const { db } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
    const data = await getAllNotes(auth, db);
    const lower = q.toLowerCase();
    const rows: any[] = data.rows || [];

    // LiveSync stores chunked note bodies in h:<hash> docs whose .data holds
    // the text. Those docs are already in this _all_docs response, so index
    // them once and assemble multi-chunk notes without extra requests.
    const chunkData = new Map<string, string>();
    for (const row of rows) {
      const d = row.doc;
      if (d && typeof d._id === 'string' && d._id.startsWith('h:') && typeof d.data === 'string') {
        chunkData.set(d._id, d.data);
      }
    }

    const results = rows
      .map((row: any) => row.doc)
      .filter((doc: any) => isPageDoc(doc))
      .map((doc: any) => {
        const title = extractTitle(doc);
        const children: string[] = Array.isArray(doc.children) ? doc.children : [];
        const assembled = children.map((id) => chunkData.get(id) ?? '').join('');
        const rawBody = assembled || doc.body || doc.content || doc.text || '';
        const { content: bodyContent } = stripFrontmatter(rawBody);
        const titleMatch = title.toLowerCase().includes(lower);
        const pathMatch = (doc.path || '').toLowerCase().includes(lower);
        const bodyMatch = bodyContent.toLowerCase().includes(lower);
        if (!titleMatch && !pathMatch && !bodyMatch) return null;
        return {
          _id: doc._id,
          title,
          snippet: extractSnippet(bodyContent || rawBody, q),
          matchIn: titleMatch ? 'title' : bodyMatch ? 'content' : 'path',
        };
      })
      .filter(Boolean)
      .slice(0, 50);

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 });
  }
}
