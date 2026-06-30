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

const DOC_ID = 'rexform-settings';

type NewNoteLocation = 'root' | 'current';
type Locale = 'en' | 'kh';
interface AppSettings {
  syncHeadingWithFilename: boolean;
  newNoteLocation: NewNoteLocation;
  language: Locale;
}

const DEFAULT_SETTINGS: AppSettings = {
  syncHeadingWithFilename: false,
  newNoteLocation: 'root',
  language: 'en',
};

// Coerce arbitrary stored/posted data into a valid settings object, filling any
// missing or malformed fields from the defaults.
function normalise(input: any): AppSettings {
  const src = input && typeof input === 'object' ? input : {};
  return {
    syncHeadingWithFilename:
      typeof src.syncHeadingWithFilename === 'boolean'
        ? src.syncHeadingWithFilename
        : DEFAULT_SETTINGS.syncHeadingWithFilename,
    newNoteLocation:
      src.newNoteLocation === 'current' || src.newNoteLocation === 'root'
        ? src.newNoteLocation
        : DEFAULT_SETTINGS.newNoteLocation,
    language:
      src.language === 'en' || src.language === 'kh'
        ? src.language
        : DEFAULT_SETTINGS.language,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Admin uses the shared 'obsidian' vault, not a per-user vault — settings are
  // a per-user-vault concept, so just return defaults (mirrors the plugins route).
  if (isAdminUser(session.user.id)) {
    return NextResponse.json(DEFAULT_SETTINGS);
  }

  const db = `vault-${session.user.id}`;
  try {
    const res = await fetch(`${COUCHDB_URL}/${db}/${DOC_ID}`, {
      headers: { Authorization: adminAuth() },
      cache: 'no-store',
    });
    if (res.status === 404) return NextResponse.json(DEFAULT_SETTINGS);
    if (!res.ok) throw new Error(`CouchDB error: ${res.status}`);
    const doc = await res.json();
    return NextResponse.json(normalise(doc.settings));
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
    return NextResponse.json(DEFAULT_SETTINGS);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  // Accept either the raw settings object or a { settings: {...} } envelope.
  const incoming = body?.settings ?? body;

  const db = `vault-${session.user.id}`;
  const docUrl = `${COUCHDB_URL}/${db}/${DOC_ID}`;
  const auth = adminAuth();

  // Read the existing doc for its _rev AND its current settings, so a partial
  // POST (e.g. just { language }) merges instead of resetting other fields.
  let rev: string | undefined;
  let existingSettings: unknown = {};
  try {
    const existing = await fetch(docUrl, { headers: { Authorization: auth }, cache: 'no-store' });
    if (existing.ok) {
      const doc = await existing.json();
      rev = doc._rev;
      existingSettings = doc.settings;
    }
  } catch {}

  const base = existingSettings && typeof existingSettings === 'object' ? existingSettings : {};
  const merged = incoming && typeof incoming === 'object' ? { ...base, ...incoming } : base;
  const settings = normalise(merged);

  try {
    const doc: Record<string, unknown> = { _id: DOC_ID, settings };
    if (rev) doc._rev = rev;
    const res = await fetch(docUrl, {
      method: 'PUT',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.reason || `CouchDB error: ${res.status}`);
    }
    return NextResponse.json(settings);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
