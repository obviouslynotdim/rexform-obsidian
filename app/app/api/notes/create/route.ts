import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchFromVault, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

async function findUniqueId(base: string, folder: string, auth: AuthHeaders | undefined, db: string) {
  for (let i = 0; i < 20; i++) {
    const suffix = i === 0 ? '' : ` ${i}`;
    const id = folder ? `${folder}/${base}${suffix}.md` : `${base}${suffix}.md`;
    const res = await fetchFromVault(encodeURIComponent(id), {}, auth, db);
    if (res.status === 404) return { id, title: base + suffix };
  }
  throw new Error('Could not find a unique name after 20 attempts');
}

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

  let id: string, resolvedTitle: string;
  try {
    ({ id, title: resolvedTitle } = await findUniqueId(title.trim(), sanitizedFolder, auth, db));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 409 });
  }

  const chunkId = `${id}_c0`;
  const now = Date.now();
  const body = content ?? `# ${resolvedTitle}\n\n`;

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
      body: JSON.stringify({ _id: id, path: id, type: 'plain', title: resolvedTitle, mtime: now, children: [chunkId] }),
    },
    auth,
    db
  );
  if (!parentRes.ok) {
    const text = await parentRes.text();
    return NextResponse.json({ error: `Failed to create note: ${text}` }, { status: parentRes.status });
  }

  return NextResponse.json({ id, title: resolvedTitle, path: id }, { status: 201 });
}
