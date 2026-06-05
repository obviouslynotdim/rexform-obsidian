import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllNotes, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

function isVaultNote(doc: { _id: string; type?: string; path?: string }): boolean {
  const id = doc._id;
  if (id.startsWith('docs/')) return false;
  if (id.startsWith('node_modules/')) return false;
  if (id.startsWith('h:')) return false;
  if (id.startsWith('_')) return false;
  if (id === 'rexform-metadata') return false;
  return doc.type === 'plain' || (typeof doc.path === 'string' && doc.path.endsWith('.md'));
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;

  try {
    const { db } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
    const data = await getAllNotes(auth, db);
    const notes = (data.rows as { doc: { _id: string; type?: string; path?: string } }[])
      .map((row) => row.doc)
      .filter(isVaultNote);
    return NextResponse.json(
      { ...data, rows: notes, total_rows: notes.length },
      { headers: { 'X-Notes-Count': String(notes.length) } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
