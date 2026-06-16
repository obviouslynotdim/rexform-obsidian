import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllNotes, isVaultNote, assembleNoteContent, extractTitle, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

const WIKILINK_RE = /\[\[([^\[\]\n]+)\]\]/g;

function resolveWikilinkToId(name: string, docs: any[]): string | null {
  const lower = name.toLowerCase();
  const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, ' ');
  const lowerNorm = norm(lower);
  for (const doc of docs) {
    const path: string = doc.path || doc._id;
    const filename = path.split('/').pop()?.replace(/\.md$/i, '') ?? '';
    if (filename.toLowerCase() === lower) return doc._id;
    if (norm(filename) === lowerNorm) return doc._id;
    if (path.replace(/\.md$/i, '').toLowerCase() === lower) return doc._id;
  }
  return null;
}

function extractSnippet(body: string, linkName: string): string {
  const re = new RegExp(`\\[\\[${linkName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\]]*\\]\\]`, 'i');
  const idx = body.search(re);
  if (idx === -1) return body.replace(/[#*`>\[\]!]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const start = Math.max(0, idx - 60);
  const end = Math.min(body.length, idx + linkName.length + 80);
  const raw = (start > 0 ? '…' : '') + body.slice(start, end).replace(/[#*`!]/g, '') + (end < body.length ? '…' : '');
  return raw.replace(/\s+/g, ' ').trim();
}

interface Props { params: { id: string } }

export async function GET(req: NextRequest, { params }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auth: AuthHeaders | undefined = session.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;

  const targetId = decodeURIComponent(params.id);

  try {
    const { db } = await resolveVault(session, req.nextUrl.searchParams.get('vault'));
    const data = await getAllNotes(auth, db);
    const docs = (data.rows as { doc: any }[]).map(r => r.doc).filter(isVaultNote);

    // Find the target doc to get its canonical filename for matching
    const targetDoc = docs.find((d: any) => d._id === targetId);

    const results: { id: string; title: string; snippet: string }[] = [];

    await Promise.all(
      docs
        .filter((doc: any) => doc._id !== targetId)
        .map(async (doc: any) => {
          const body = await assembleNoteContent(doc, auth, db).catch(() => '');
          if (!body) return;

          const mentions: string[] = [];
          let m: RegExpExecArray | null;
          const re = new RegExp(WIKILINK_RE.source, 'g');
          while ((m = re.exec(body)) !== null) {
            const linkName = m[1].trim();
            const resolved = resolveWikilinkToId(linkName, docs);
            if (resolved === targetId) {
              mentions.push(linkName);
            }
          }

          if (mentions.length > 0) {
            results.push({
              id: doc._id,
              title: extractTitle(doc),
              snippet: extractSnippet(body, mentions[0]),
            });
          }
        })
    );

    // Sort by title for consistent ordering
    results.sort((a, b) => a.title.localeCompare(b.title));

    return NextResponse.json({ backlinks: results, targetId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
