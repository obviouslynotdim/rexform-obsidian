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

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10)));

  try {
    const { db } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
    const data = await getAllNotes(auth, db);
    const allNotes = (data.rows as { doc: any }[])
      .map((row) => row.doc)
      .filter(isVaultNote)
      .sort((a: any, b: any) => (b.mtime ?? 0) - (a.mtime ?? 0));

    const total = allNotes.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;
    const notes = allNotes.slice(skip, skip + limit);

    return NextResponse.json({
      rows: notes,
      total,
      page: safePage,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1,
      limit,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
