export const dynamic = 'force-dynamic';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import {
  getNote,
  assembleNoteContent,
  extractTitle,
  stripFrontmatter,
  AuthHeaders,
} from '@/lib/couchdb';
import { getActiveVault } from '@/lib/active-vault';
import Link from 'next/link';
import NoteViewClient from '@/components/NoteViewClient';

interface Props {
  params: { id: string };
}

export default async function NotePage({ params }: Props) {
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;
  const db = await getActiveVault(session);

  const urlId = decodeURIComponent(params.id);
  let noteId = urlId;
  let note: any = null;
  let content = '';
  let frontmatter: Record<string, string> = {};
  let error = '';

  // Try the URL id as-is; if not found, retry with .md suffix for clean-URL support
  try {
    note = await getNote(urlId, auth, db);
  } catch {
    // silently swallow — retry below
  }

  if (!note && !urlId.endsWith('.md')) {
    try {
      note = await getNote(urlId + '.md', auth, db);
      if (note) noteId = urlId + '.md';
    } catch {}
  }

  if (note) {
    try {
      const raw = await assembleNoteContent(note, auth, db);
      const parsed = stripFrontmatter(raw);
      content = parsed.content;
      frontmatter = parsed.frontmatter;
    } catch (e: any) {
      error = e.message || 'Failed to load note';
    }
  } else {
    error = 'Note not found';
  }

  const title = frontmatter.title || (note ? extractTitle(note) : noteId);
  const folder = note?.path ? (note.path as string).split('/').slice(0, -1).join('/') : '';
  const tags = frontmatter.tags
    ? frontmatter.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : [];

  return (
    <div className="h-full overflow-y-auto">
      {error ? (
        <div className="p-8">
          <div className="rounded-xl p-6 border border-red-800 bg-red-900/20">
            <p className="text-red-400 font-medium">Error loading note</p>
            <p className="text-red-300/70 text-sm mt-1">{error}</p>
          </div>
          <Link href="/notes" className="mt-4 inline-block text-sm" style={{ color: 'var(--accent)' }}>
            ← Back to notes
          </Link>
        </div>
      ) : (
        <NoteViewClient
          noteId={noteId}
          title={title}
          content={content}
          folder={folder}
          tags={tags}
          mtime={note?.mtime}
          size={note?.size}
        />
      )}
    </div>
  );
}
