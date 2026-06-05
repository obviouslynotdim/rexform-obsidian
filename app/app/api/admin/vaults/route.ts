import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser, createSharedVault } from '@/lib/vault';
import { grantVaultAccess } from '@/lib/keto';

const INTERNAL_URL =
  process.env.COUCHDB_INTERNAL_URL || process.env.COUCHDB_URL || 'http://localhost:5984';
const ADMIN_USER = process.env.COUCHDB_ADMIN_USER || process.env.COUCHDB_USERNAME || 'admin';
const ADMIN_PASS = process.env.COUCHDB_ADMIN_PASSWORD || process.env.COUCHDB_PASSWORD || '';

function adminAuth() {
  return 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const res = await fetch(`${INTERNAL_URL}/_all_dbs`, {
    headers: { Authorization: adminAuth() },
  });
  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to list databases' }, { status: 500 });
  }

  const allDbs: string[] = await res.json();
  const sharedDbs = allDbs.filter((db) => db.startsWith('vault-shared-'));

  const vaults = await Promise.all(
    sharedDbs.map(async (dbName) => {
      try {
        const metaRes = await fetch(`${INTERNAL_URL}/${dbName}/rexform-metadata`, {
          headers: { Authorization: adminAuth() },
        });
        const infoRes = await fetch(`${INTERNAL_URL}/${dbName}`, {
          headers: { Authorization: adminAuth() },
        });
        const meta = metaRes.ok ? await metaRes.json() : {};
        const info = infoRes.ok ? await infoRes.json() : {};
        return {
          vaultId: dbName,
          vaultName: meta.vaultName || dbName,
          createdBy: meta.createdBy || null,
          createdAt: meta.createdAt || null,
          docCount: info.doc_count ?? 0,
          sizeBytes: info.sizes?.active ?? 0,
        };
      } catch {
        return { vaultId: dbName, vaultName: dbName, createdBy: null, createdAt: null, docCount: 0, sizeBytes: 0 };
      }
    })
  );

  return NextResponse.json({ vaults });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let name: string;
  try {
    ({ name } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Vault name is required' }, { status: 400 });
  }

  const { vaultId, vaultName } = await createSharedVault(name.trim(), session.user.id);

  // Grant creator owner access in Keto
  if (process.env.KETO_WRITE_URL) {
    try {
      await grantVaultAccess(vaultId, session.user.id, 'owner');
    } catch (e) {
      console.warn('[admin/vaults] Keto grant failed:', e);
    }
  }

  return NextResponse.json({ vaultId, vaultName }, { status: 201 });
}
