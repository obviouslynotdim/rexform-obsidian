import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchFromVault, getUserVault, AuthHeaders } from '@/lib/couchdb';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auth: AuthHeaders | undefined = session.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;
  const db = getUserVault(session);

  let title: string, content: string;
  try {
    ({ title, content } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  const id = `${title.trim()}.md`;
  const chunkId = `${title.trim()}.md_c0`;
  const now = Date.now();
  const body = content ?? `# ${title.trim()}\n\n`;

  // Create chunk first
  const chunkRes = await fetchFromVault(
    encodeURIComponent(chunkId),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id: chunkId, data: body }),
    },
    auth,
    db
  );

  if (!chunkRes.ok) {
    const text = await chunkRes.text();
    return NextResponse.json({ error: `Failed to create chunk: ${text}` }, { status: chunkRes.status });
  }

  // Create parent doc
  const parentRes = await fetchFromVault(
    encodeURIComponent(id),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        _id: id,
        path: id,
        type: 'plain',
        title: title.trim(),
        mtime: now,
        children: [chunkId],
      }),
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
