import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getUserCredentials, provisionUserCredentials, regenerateCredentials } from '@/lib/couchdb-credentials';
import { isAdminUser } from '@/lib/vault';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  if (isAdminUser(userId)) {
    return NextResponse.json({ error: 'Admin account uses the obsidian vault directly' }, { status: 400 });
  }

  let creds = await getUserCredentials(userId);
  if (!creds) {
    try {
      creds = await provisionUserCredentials(userId);
    } catch (e: any) {
      console.error('[credentials] auto-provision failed:', e.message);
      return NextResponse.json({ error: `Failed to provision credentials: ${e.message}` }, { status: 500 });
    }
  }

  const couchDbUrl = process.env.COUCHDB_URL || '';
  const database = `vault-${userId}`;

  return NextResponse.json({ ...creds, serverUrl: couchDbUrl, database });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  if (isAdminUser(userId)) {
    return NextResponse.json({ error: 'Admin account uses the obsidian vault directly' }, { status: 400 });
  }

  const creds = await regenerateCredentials(userId);
  const couchDbUrl = process.env.COUCHDB_URL || '';
  const database = `vault-${userId}`;

  return NextResponse.json({ ...creds, serverUrl: couchDbUrl, database });
}
