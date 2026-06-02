import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser } from '@/lib/vault';

const COUCH_BASE = process.env.COUCHDB_URL || 'http://localhost:5984';
const COUCH_USER = process.env.COUCHDB_USERNAME || 'admin';
const COUCH_PASS = process.env.COUCHDB_PASSWORD || '';

function couchAuth() {
  return 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = params.id;

  // Prevent deleting the admin's own vault
  if (isAdminUser(userId)) {
    return NextResponse.json({ error: 'Cannot delete the admin vault' }, { status: 400 });
  }

  const dbName = `vault-${userId}`;
  const res = await fetch(`${COUCH_BASE}/${dbName}`, {
    method: 'DELETE',
    headers: { Authorization: couchAuth() },
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    return NextResponse.json({ error: `CouchDB error: ${text}` }, { status: res.status });
  }

  return NextResponse.json({ success: true, deleted: dbName });
}
