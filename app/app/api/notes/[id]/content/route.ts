import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getNote, assembleNoteContent, extractTitle, stripFrontmatter, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;
  const { db } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
  const id = decodeURIComponent(params.id);

  try {
    const doc = await getNote(id, auth, db);
    const raw = await assembleNoteContent(doc, auth, db);
    const { content } = stripFrontmatter(raw);
    const title = extractTitle(doc);
    return NextResponse.json({ content, title });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
