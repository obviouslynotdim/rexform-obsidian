import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser } from '@/lib/vault';

const COUCHDB_URL =
  process.env.COUCHDB_URL || process.env.COUCHDB_INTERNAL_URL || 'http://localhost:5984';
const ADMIN_USER =
  process.env.COUCHDB_ADMIN_USER || process.env.COUCHDB_USERNAME || 'admin';
const ADMIN_PASS =
  process.env.COUCHDB_ADMIN_PASSWORD || process.env.COUCHDB_PASSWORD || '';

function adminAuth() {
  return 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');
}

const DEFAULT_PLUGINS = { kanban: false, calendar: false, gitlab: false };
const DOC_ID = 'rexform-plugins';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Admin users share the obsidian vault — return defaults rather than storing plugin prefs there
  if (isAdminUser(session.user.id)) {
    return NextResponse.json({ plugins: DEFAULT_PLUGINS });
  }

  const db = `vault-${session.user.id}`;
  try {
    const res = await fetch(`${COUCHDB_URL}/${db}/${DOC_ID}`, {
      headers: { Authorization: adminAuth() },
      cache: 'no-store',
    });
    if (res.status === 404) {
      return NextResponse.json({ plugins: DEFAULT_PLUGINS });
    }
    if (!res.ok) throw new Error(`CouchDB error: ${res.status}`);
    const doc = await res.json();
    return NextResponse.json({ plugins: { ...DEFAULT_PLUGINS, ...(doc.plugins ?? {}) } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (isAdminUser(session.user.id)) {
    return NextResponse.json({ plugins: DEFAULT_PLUGINS });
  }

  let plugins: Record<string, boolean>;
  try {
    ({ plugins } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const db = `vault-${session.user.id}`;
  const docUrl = `${COUCHDB_URL}/${db}/${DOC_ID}`;
  const auth = adminAuth();

  // Fetch existing _rev so we can update without conflict
  let rev: string | undefined;
  try {
    const existing = await fetch(docUrl, { headers: { Authorization: auth }, cache: 'no-store' });
    if (existing.ok) {
      const data = await existing.json();
      rev = data._rev;
    }
  } catch {}

  try {
    const body: Record<string, unknown> = { _id: DOC_ID, plugins };
    if (rev) body._rev = rev;
    const res = await fetch(docUrl, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.reason || `CouchDB error: ${res.status}`);
    }
    return NextResponse.json({ plugins });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
