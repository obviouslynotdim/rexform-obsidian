import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser } from '@/lib/vault';
import { kratosAdmin } from '@/lib/kratos';

const COUCH_BASE = process.env.COUCHDB_URL || 'http://localhost:5984';
const COUCH_USER = process.env.COUCHDB_USERNAME || 'admin';
const COUCH_PASS = process.env.COUCHDB_PASSWORD || '';

function couchAuth() {
  return 'Basic ' + Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64');
}

async function getVaultInfo(userId: string) {
  const dbName = `vault-${userId}`;
  try {
    const res = await fetch(`${COUCH_BASE}/${dbName}`, {
      headers: { Authorization: couchAuth() },
      cache: 'no-store',
    });
    if (res.status === 404) return { exists: false, docCount: 0, dbName, sizeBytes: 0 };
    if (!res.ok) return { exists: false, docCount: 0, dbName, sizeBytes: 0 };
    const info = await res.json();
    const sizeBytes: number = info.sizes?.active ?? info.disk_size ?? 0;
    return { exists: true, docCount: info.doc_count ?? 0, dbName, sizeBytes };
  } catch {
    return { exists: false, docCount: 0, dbName, sizeBytes: 0 };
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(sp.get('limit') ?? '20', 10)));
  const search = (sp.get('search') ?? '').trim().toLowerCase();
  const stateFilter = sp.get('state') ?? 'all';   // all | active | suspended
  const vaultFilter = sp.get('vault') ?? 'all';   // all | has | none

  try {
    const { data: identities } = await kratosAdmin.listIdentities({ perPage: 500 });

    const allUsers = await Promise.all(
      identities.map(async (identity) => {
        const vault = await getVaultInfo(identity.id);
        return {
          id: identity.id,
          email: (identity.traits as any)?.email ?? '—',
          createdAt: identity.created_at ?? null,
          state: identity.state ?? 'active',
          isAdmin: isAdminUser(identity.id),
          vault,
        };
      })
    );

    allUsers.sort((a, b) => {
      if (a.isAdmin) return -1;
      if (b.isAdmin) return 1;
      return new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime();
    });

    // Global stats — always over the full user list, not the filtered page.
    const stats = {
      total: allUsers.length,
      activeVaults: allUsers.filter((u) => u.vault.exists).length,
      suspended: allUsers.filter((u) => !u.isAdmin && u.state !== 'active').length,
      missingVaults: allUsers.filter((u) => !u.vault.exists && !u.isAdmin).length,
    };

    // Search + filters run over ALL users, then paginate the result.
    let filtered = allUsers;
    if (search) {
      filtered = filtered.filter(
        (u) => u.email.toLowerCase().includes(search) || u.id.toLowerCase().includes(search)
      );
    }
    if (stateFilter === 'active') filtered = filtered.filter((u) => u.state === 'active');
    if (stateFilter === 'suspended') filtered = filtered.filter((u) => u.state !== 'active');
    if (vaultFilter === 'has') filtered = filtered.filter((u) => u.vault.exists);
    if (vaultFilter === 'none') filtered = filtered.filter((u) => !u.vault.exists);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;
    const users = filtered.slice(skip, skip + limit);

    return NextResponse.json({ users, total, page: safePage, totalPages, stats });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code = String(e?.code ?? e?.cause?.code ?? '');
    if (/ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT/i.test(msg + ' ' + code)) {
      const adminUrl = process.env.KRATOS_ADMIN_URL || 'http://localhost:4434';
      return NextResponse.json(
        {
          error:
            `Cannot reach the Kratos admin API at ${adminUrl}. ` +
            `Railway-internal hostnames (…railway.internal) only resolve inside Railway's private network, ` +
            `so user management works on the deployed app but not in local development. ` +
            `To manage users locally, point KRATOS_ADMIN_URL in app/.env.local at a reachable Kratos admin endpoint.`,
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
