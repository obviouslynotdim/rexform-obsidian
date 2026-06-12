import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllNotes, isVaultNote, extractTitle, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;

  try {
    const { db } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
    const data = await getAllNotes(auth, db);
    const notes = (data.rows as { doc: any }[])
      .map((row) => row.doc)
      .filter(isVaultNote)
      .map((doc: any) => ({ id: doc._id, path: (doc.path || doc._id) as string, title: extractTitle(doc) }))
      .sort((a, b) => a.path.localeCompare(b.path));

    return NextResponse.json({ notes });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
