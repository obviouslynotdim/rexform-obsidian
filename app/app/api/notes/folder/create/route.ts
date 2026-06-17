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

  let folder: string;
  try {
    ({ folder } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const sanitizedFolder = (folder || '').trim().replace(/^\/+|\/+$/g, '');
  if (!sanitizedFolder) {
    return NextResponse.json({ error: 'folder is required' }, { status: 400 });
  }

  const keepId = `${sanitizedFolder}/.keep`;

  // If marker already exists the folder is already visible — return success without overwriting
  const existingRes = await fetchFromVault(encodeURIComponent(keepId), {}, auth, db);
  if (existingRes.ok) {
    return NextResponse.json({ folder: sanitizedFolder });
  }

  const res = await fetchFromVault(
    encodeURIComponent(keepId),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id: keepId, rexform_marker: true, path: keepId }),
    },
    auth,
    db
  );

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Failed to create folder: ${text}` }, { status: res.status });
  }

  return NextResponse.json({ folder: sanitizedFolder }, { status: 201 });
}
