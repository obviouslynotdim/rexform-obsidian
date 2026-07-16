import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllNotes, isVaultNote, assembleNoteContent, AuthHeaders } from '@/lib/couchdb';
import { resolveVault } from '@/lib/active-vault';

const WIKILINK_RE = /\[\[([^\[\]\n]+)\]\]/g;

// File extensions treated as attachments when wikilinked (e.g. ![[image.png]]).
const ATTACHMENT_RE = /\.(png|jpe?g|gif|svg|webp|bmp|ico|pdf|mp3|wav|ogg|m4a|mp4|mov|webm|zip|docx?|xlsx?|pptx?|csv)$/i;

type NodeType = 'note' | 'tag' | 'attachment' | 'unresolved';

// Collect tags from a note body: frontmatter `tags:` (inline array, comma/space
// separated, or YAML list) plus inline #hashtags.
function extractTags(body: string): string[] {
  const tags = new Set<string>();
  const add = (raw: string) => {
    const t = raw.trim().replace(/^['"]|['"]$/g, '').replace(/^#/, '');
    if (t) tags.add(t);
  };

  const fm = body.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const tagLine = fm[1].match(/^tags:\s*(.*)$/m);
    if (tagLine) {
      const v = tagLine[1].trim();
      if (v.startsWith('[')) {
        v.replace(/^\[|\]$/g, '').split(',').forEach(add);
      } else if (v) {
        v.split(/[,\s]+/).forEach(add);
      } else {
        const lines = fm[1].split(/\r?\n/);
        const idx = lines.findIndex(l => /^tags:\s*$/.test(l));
        for (let j = idx + 1; idx >= 0 && j < lines.length; j++) {
          const lm = lines[j].match(/^\s*-\s*(.+)$/);
          if (!lm) break;
          add(lm[1]);
        }
      }
    }
  }

  const bodyOnly = fm ? body.slice(fm[0].length) : body;
  const re = /(^|[\s(])#([A-Za-z_][A-Za-z0-9_\-\/]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bodyOnly)) !== null) tags.add(m[2]);
  return Array.from(tags);
}

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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;

  try {
    const sp = req.nextUrl.searchParams;
    const { db } = await resolveVault(session, sp.get('vault'));
    const data = await getAllNotes(auth, db);

    const allDocs = (data.rows as { doc: any }[])
      .map(r => r.doc)
      .filter(isVaultNote);

    // Optional folder scope: only include notes within the given folder path.
    const folderParam = sp.get('folder');
    const docs = folderParam
      ? allDocs.filter((doc: any) => {
          const p: string = doc.path || doc._id;
          return p === folderParam || p.startsWith(folderParam + '/');
        })
      : allDocs;

    const contents = await Promise.all(
      docs.map((doc: any) => assembleNoteContent(doc, auth, db).catch(() => ''))
    );

    const linkCounts: Record<string, number> = {};
    docs.forEach((doc: any) => { linkCounts[doc._id] = 0; });

    // Non-note nodes (tags, attachments, unresolved links) keyed by node id —
    // the client filters these by type via the graph settings panel.
    const extraNodes = new Map<string, { id: string; title: string; type: NodeType }>();
    const edges: { source: string; target: string }[] = [];
    const seenEdges = new Set<string>();

    const addEdge = (a: string, b: string) => {
      const edgeKey = [a, b].sort().join('|||');
      if (seenEdges.has(edgeKey)) return;
      seenEdges.add(edgeKey);
      edges.push({ source: a, target: b });
      linkCounts[a] = (linkCounts[a] || 0) + 1;
      linkCounts[b] = (linkCounts[b] || 0) + 1;
    };

    docs.forEach((doc: any, i: number) => {
      const body = contents[i] || '';
      let m: RegExpExecArray | null;
      const re = new RegExp(WIKILINK_RE.source, 'g');
      while ((m = re.exec(body)) !== null) {
        // Strip alias ([[Note|alias]]) and heading ([[Note#heading]]) parts.
        const name = m[1].split('|')[0].split('#')[0].trim();
        if (!name) continue;
        if (ATTACHMENT_RE.test(name)) {
          const id = `attachment:${name.toLowerCase()}`;
          if (!extraNodes.has(id)) {
            extraNodes.set(id, { id, title: name.split('/').pop() ?? name, type: 'attachment' });
          }
          addEdge(doc._id, id);
          continue;
        }
        const targetId = resolveWikilinkToId(name, docs);
        if (targetId === doc._id) continue;
        if (targetId) {
          addEdge(doc._id, targetId);
        } else {
          const id = `unresolved:${name.toLowerCase()}`;
          if (!extraNodes.has(id)) extraNodes.set(id, { id, title: name, type: 'unresolved' });
          addEdge(doc._id, id);
        }
      }
      for (const tag of extractTags(body)) {
        const id = `tag:${tag.toLowerCase()}`;
        if (!extraNodes.has(id)) extraNodes.set(id, { id, title: `#${tag}`, type: 'tag' });
        addEdge(doc._id, id);
      }
    });

    const nodes = [
      ...docs.map((doc: any) => ({
        id: doc._id as string,
        path: (doc.path as string) || doc._id,
        title: ((doc.path as string) || doc._id).split('/').pop()?.replace(/\.md$/i, '') ?? doc._id,
        linkCount: linkCounts[doc._id] || 0,
        type: 'note' as NodeType,
      })),
      ...Array.from(extraNodes.values()).map(n => ({
        ...n,
        linkCount: linkCounts[n.id] || 0,
      })),
    ];

    return NextResponse.json({ nodes, edges });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
