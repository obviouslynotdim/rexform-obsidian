import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllNotes, isPageDoc, extractTitle, buildPreview, getUserVault, AuthHeaders } from '@/lib/couchdb';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;
  const db = getUserVault(session);

  try {
    const data = await getAllNotes(auth, db);
    const lower = q.toLowerCase();

    const results = (data.rows || [])
      .map((row: any) => row.doc)
      .filter((doc: any) => {
        if (!isPageDoc(doc)) return false;
        const searchable = [doc.path || '', extractTitle(doc)].join(' ').toLowerCase();
        return searchable.includes(lower);
      })
      .slice(0, 50)
      .map((doc: any) => ({
        _id: doc._id,
        title: extractTitle(doc),
        snippet: buildPreview(doc),
      }));

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, results: [] }, { status: 500 });
  }
}
