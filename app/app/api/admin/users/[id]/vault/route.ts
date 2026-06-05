import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser } from '@/lib/vault';
import { kratosAdmin } from '@/lib/kratos';

const COUCH_BASE = process.env.COUCHDB_URL || 'http://localhost:5984';
const COUCH_USER = process.env.COUCHDB_ADMIN_USER || process.env.COUCHDB_USERNAME || 'admin';
const COUCH_PASS = process.env.COUCHDB_ADMIN_PASSWORD || process.env.COUCHDB_PASSWORD || '';

function couchAuth() {
  return 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = params.id;

  if (isAdminUser(userId)) {
    return NextResponse.json({ error: 'Cannot delete the admin account' }, { status: 400 });
  }

  const results: Record<string, 'ok' | 'not_found' | string> = {};

  // Step 1: Delete Kratos identity
  try {
    await kratosAdmin.deleteIdentity({ id: userId });
    results.kratos = 'ok';
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message ?? e.message ?? 'unknown';
    console.error(`[admin delete] Kratos identity ${userId}: ${msg}`);
    results.kratos = msg;
  }

  // Step 2: Delete CouchDB vault database
  try {
    const vaultRes = await fetch(`${COUCH_BASE}/vault-${userId}`, {
      method: 'DELETE',
      headers: { Authorization: couchAuth() },
    });
    results.vault = vaultRes.ok || vaultRes.status === 404 ? 'ok' : `${vaultRes.status}`;
    if (!vaultRes.ok && vaultRes.status !== 404) {
      console.error(`[admin delete] vault delete ${userId}: ${vaultRes.status}`);
    }
  } catch (e: any) {
    console.error(`[admin delete] vault delete ${userId}:`, e.message);
    results.vault = e.message;
  }

  // Step 3: Delete CouchDB _users doc
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
    console.error(`[admin delete] _users delete ${userId}:`, e.message);
    results.credentials = e.message;
  }

  const allOk = Object.values(results).every((v) => v === 'ok' || v === 'not_found');
  return NextResponse.json({ success: allOk, results });
}
