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

const DOC_ID = 'rexform-plugins';
const DEFAULT_STATE = { installed: [] as string[], enabled: {} as Record<string, boolean> };

// Migrate legacy format { plugins: { kanban: bool } } → { installed, enabled }
function normalise(doc: any): { installed: string[]; enabled: Record<string, boolean> } {
  if (Array.isArray(doc.installed)) {
    return { installed: doc.installed, enabled: doc.enabled ?? {} };
  }
  if (doc.plugins && typeof doc.plugins === 'object') {
    const installed = Object.keys(doc.plugins).filter((k) => doc.plugins[k] === true);
    const enabled: Record<string, boolean> = {};
    installed.forEach((k) => { enabled[k] = true; });
    return { installed, enabled };
  }
  return DEFAULT_STATE;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (isAdminUser(session.user.id)) {
    return NextResponse.json(DEFAULT_STATE);
  }

  const db = `vault-${session.user.id}`;
  try {
    const res = await fetch(`${COUCHDB_URL}/${db}/${DOC_ID}`, {
      headers: { Authorization: adminAuth() },
      cache: 'no-store',
    });
    if (res.status === 404) return NextResponse.json(DEFAULT_STATE);
    if (!res.ok) throw new Error(`CouchDB error: ${res.status}`);
    return NextResponse.json(normalise(await res.json()));
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
    return NextResponse.json(DEFAULT_STATE);
  }

  let installed: string[];
  let enabled: Record<string, boolean>;
  try {
    ({ installed, enabled } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const db = `vault-${session.user.id}`;
  const docUrl = `${COUCHDB_URL}/${db}/${DOC_ID}`;
  const auth = adminAuth();

  let rev: string | undefined;
  try {
    const existing = await fetch(docUrl, { headers: { Authorization: auth }, cache: 'no-store' });
    if (existing.ok) rev = (await existing.json())._rev;
  } catch {}

  try {
    const body: Record<string, unknown> = { _id: DOC_ID, installed, enabled };
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
    return NextResponse.json({ installed, enabled });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
