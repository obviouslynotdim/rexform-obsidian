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
import NotesSidebar from '@/components/NotesSidebar';
import NoteViewClient from '@/components/NoteViewClient';

interface Props {
  params: { id: string };
}

export default async function NotePage({ params }: Props) {
  const session = await getServerSession(authOptions);
  const auth: AuthHeaders | undefined = session?.kratosSessionToken
    ? { authorization: `Bearer ${session.kratosSessionToken}` }
    : undefined;
  const db = getActiveVault(session);

  const id = decodeURIComponent(params.id);
  let note: any = null;
  let content = '';
  let frontmatter: Record<string, string> = {};
  let error = '';

  try {
    note = await getNote(id, auth, db);
    const raw = await assembleNoteContent(note, auth, db);
    const parsed = stripFrontmatter(raw);
    content = parsed.content;
    frontmatter = parsed.frontmatter;
  } catch (e: any) {
    error = e.message || 'Failed to load note';
  }

  const title = frontmatter.title || (note ? extractTitle(note) : id);
  const folder = note?.path ? (note.path as string).split('/').slice(0, -1).join('/') : '';
  const tags = frontmatter.tags
    ? frontmatter.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : [];

  return (
    <div className="flex h-[calc(100vh-56px)]" style={{ background: 'var(--bg-base)' }}>
      <NotesSidebar currentId={id} />

      <div className="flex-1 overflow-y-auto">
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
            noteId={id}
            title={title}
            content={content}
            folder={folder}
            tags={tags}
            mtime={note?.mtime}
            size={note?.size}
          />
        )}
      </div>
    </div>
  );
}
