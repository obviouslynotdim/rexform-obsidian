import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllNotes, isPageDoc, isVaultNote, extractTitle, AuthHeaders } from '@/lib/couchdb';
import { parseFrontmatter } from '@/lib/frontmatter';
import { isKanbanFrontmatter, parseKanban } from '@/lib/kanban';
import { resolveVault } from '@/lib/active-vault';

// Lists the vault's Kanban boards — notes whose frontmatter has the
// `kanban-plugin` key. One _all_docs call: chunk docs come back alongside the
// page docs, so contents are assembled from the in-memory map (no per-note
// fetches).
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;

  try {
    const { db } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
    const data = await getAllNotes(auth, db);
    const docs = (data.rows || []).map((row: any) => row.doc).filter(Boolean);

    const chunkData = new Map<string, string>();
    for (const doc of docs) {
      if (typeof doc.data === 'string') chunkData.set(doc._id, doc.data);
    }

    const boards = docs
      .filter((doc: any) => isPageDoc(doc) && isVaultNote(doc))
      .map((doc: any) => {
        const raw = Array.isArray(doc.children) && doc.children.length > 0
          ? doc.children.map((id: string) => chunkData.get(id) ?? '').join('')
          : doc.body || doc.content || doc.text || '';
        const { frontmatter, content } = parseFrontmatter(raw);
        if (!isKanbanFrontmatter(frontmatter)) return null;
        const board = parseKanban(content);
        return {
          id: doc._id,
          title: extractTitle(doc),
          path: doc.path,
          mtime: doc.mtime ?? null,
          columns: board.columns.length,
          cards: board.columns.reduce((n, c) => n + c.cards.length, 0),
        };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => (b.mtime ?? 0) - (a.mtime ?? 0));

    return NextResponse.json({ boards });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, boards: [] }, { status: 500 });
  }
}
