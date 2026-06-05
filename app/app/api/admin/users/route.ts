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

  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10)));

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

    const total = allUsers.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const skip = (safePage - 1) * limit;
    const users = allUsers.slice(skip, skip + limit);

    return NextResponse.json({ users, total, page: safePage, totalPages });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
