import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser } from '@/lib/vault';

const COUCH_BASE = process.env.COUCHDB_URL || 'http://localhost:5984';
const COUCH_USER = process.env.COUCHDB_ADMIN_USER || process.env.COUCHDB_USERNAME || 'admin';
const COUCH_PASS = process.env.COUCHDB_ADMIN_PASSWORD || process.env.COUCHDB_PASSWORD || '';

function couchAuth() {
  return 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');
}

// Deletes only the user's CouchDB vault + credentials — Kratos identity is preserved.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = params.id;
  if (isAdminUser(userId)) {
    return NextResponse.json({ error: 'Cannot delete the admin vault' }, { status: 400 });
  }

  const results: Record<string, string> = {};

  // Step 1: Delete CouchDB vault database
  try {
    const res = await fetch(`${COUCH_BASE}/vault-${userId}`, {
      method: 'DELETE',
      headers: { Authorization: couchAuth() },
    });
    results.vault = res.ok || res.status === 404 ? 'ok' : `${res.status}`;
  } catch (e: any) {
    results.vault = e.message;
  }

  // Step 2: Delete CouchDB _users credential doc
  try {
    const docId = `org.couchdb.user:${userId}`;
    const getRes = await fetch(
      `${COUCH_BASE}/_users/${encodeURIComponent(docId)}`,
      { headers: { Authorization: couchAuth() } }
    );
    if (getRes.status === 404) {
      results.credentials = 'not_found';
    } else if (getRes.ok) {
      const doc = await getRes.json();
      const delRes = await fetch(
        `${COUCH_BASE}/_users/${encodeURIComponent(docId)}?rev=${doc._rev}`,
        { method: 'DELETE', headers: { Authorization: couchAuth() } }
      );
      results.credentials = delRes.ok ? 'ok' : `${delRes.status}`;
    } else {
      results.credentials = `${getRes.status}`;
    }
  } catch (e: any) {
    results.credentials = e.message;
  }

  const allOk = Object.values(results).every((v) => v === 'ok' || v === 'not_found');
  return NextResponse.json({ success: allOk, results });
}
