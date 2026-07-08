import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser } from '@/lib/vault';
import { getVaultMembers, revokeVaultAccess } from '@/lib/keto';

const INTERNAL_URL =
  process.env.COUCHDB_URL || process.env.COUCHDB_INTERNAL_URL || 'http://localhost:5984';
const ADMIN_USER = process.env.COUCHDB_ADMIN_USER || process.env.COUCHDB_USERNAME || 'admin';
const ADMIN_PASS = process.env.COUCHDB_ADMIN_PASSWORD || process.env.COUCHDB_PASSWORD || '';

function adminAuth() {
  return 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
}

export async function DELETE(
  _req: Request,
  { params }: { params: { vaultId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { vaultId } = params;
  // Shared vaults and extra personal vaults only — primary vaults (vault-<userId>)
  // go through /api/admin/users/[id]/vault-db so credentials are handled too.
  if (!vaultId.startsWith('vault-shared-') && !vaultId.startsWith('uvault-')) {
    return NextResponse.json(
      { error: 'Can only delete shared or personal (uvault) vaults via this endpoint' },
      { status: 400 }
    );
  }

  const results: Record<string, string> = {};

  // Step 1: Revoke all Keto relations
  try {
    const members = await getVaultMembers(vaultId);
    await Promise.all(members.map((m) => revokeVaultAccess(vaultId, m.userId, m.role)));
    results.keto = 'ok';
  } catch (e: any) {
    console.error(`[admin] Keto revoke for ${vaultId}:`, e.message);
    results.keto = e.message;
  }

  // Step 2: Delete CouchDB database
  try {
    const res = await fetch(`${INTERNAL_URL}/${vaultId}`, {
      method: 'DELETE',
      headers: { Authorization: adminAuth() },
    });
    results.couchdb = res.ok || res.status === 404 ? 'ok' : `${res.status}`;
  } catch (e: any) {
    console.error(`[admin] CouchDB delete ${vaultId}:`, e.message);
    results.couchdb = e.message;
  }

  const allOk = Object.values(results).every((v) => v === 'ok' || v === 'not_found');
  return NextResponse.json({ success: allOk, results });
}
