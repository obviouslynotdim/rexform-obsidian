import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchFromVault, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

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
    return NextResponse.json({ error: 'Read-only access to this vault' }, { status: 403 });
  }

  let title: string, content: string, folder: string;
  try {
    ({ title, content, folder } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const sanitizedFolder = (folder || '').trim().replace(/^\/+|\/+$/g, '');
  const id = sanitizedFolder ? `${sanitizedFolder}/${title.trim()}.md` : `${title.trim()}.md`;
  const chunkId = `${id}_c0`;
  const now = Date.now();
  const body = content ?? `# ${title.trim()}\n\n`;

  const chunkRes = await fetchFromVault(
    encodeURIComponent(chunkId),
    { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _id: chunkId, data: body }) },
    auth,
    db
  );
  if (!chunkRes.ok) {
    const text = await chunkRes.text();
    return NextResponse.json({ error: `Failed to create chunk: ${text}` }, { status: chunkRes.status });
  }

  const parentRes = await fetchFromVault(
    encodeURIComponent(id),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id: id, path: id, type: 'plain', title: title.trim(), mtime: now, children: [chunkId] }),
    },
    auth,
    db
  );
  if (!parentRes.ok) {
    const text = await parentRes.text();
    return NextResponse.json({ error: `Failed to create note: ${text}` }, { status: parentRes.status });
  }

  return NextResponse.json({ id, title: title.trim(), path: id }, { status: 201 });
}
