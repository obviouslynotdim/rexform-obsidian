'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import useSWR from 'swr';
import { useTabsContext } from '@/context/TabsContext';

interface NoteStub { id: string; path: string; title?: string }

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function preprocessWikilinks(content: string): string {
  return content.replace(/\[\[([^\[\]\n]+)\]\]/g, (_, name) => {
    const trimmed = name.trim();
    return `[${trimmed}](wikilink:${encodeURIComponent(trimmed)})`;
  });
}

function resolveWikilink(name: string, notes: NoteStub[]): string | null {
  const lower = name.toLowerCase();
  const norm = (s: string) => s.toLowerCase().replace(/[-_]/g, ' ');

  // 1. Exact filename match (case-insensitive)
  const byFilename = notes.find((n) => {
    const filename = n.path.split('/').pop()?.replace(/\.md$/i, '') ?? '';
    return filename.toLowerCase() === lower;
  });
  if (byFilename) return byFilename.id.replace(/\.md$/i, '');

  // 2. Normalized match — hyphens/underscores treated as spaces
  const lowerNorm = norm(lower);
  const byNorm = notes.find((n) => {
    const filename = n.path.split('/').pop()?.replace(/\.md$/i, '') ?? '';
    return norm(filename) === lowerNorm;
  });
  if (byNorm) return byNorm.id.replace(/\.md$/i, '');

  // 3. Full id match (case-insensitive, strip .md)
  const byId = notes.find((n) => n.id.replace(/\.md$/i, '').toLowerCase() === lower);
  if (byId) return byId.id.replace(/\.md$/i, '');

  // 4. Note title match (case-insensitive) — catches notes whose title differs from filename
  const byTitle = notes.find((n) => n.title && n.title.toLowerCase() === lower);
  if (byTitle) return byTitle.id.replace(/\.md$/i, '');

  // 5. Partial path match — [[subfolder/note]] matches "vault/subfolder/note.md"
  const byPartialPath = notes.find((n) => {
    const pathNoExt = n.path.replace(/\.md$/i, '').toLowerCase();
    return pathNoExt === lower || pathNoExt.endsWith('/' + lower);
  });
  return byPartialPath?.id.replace(/\.md$/i, '') ?? null;
}

export default function WikiMarkdown({ children }: { children: string }) {
  const { data } = useSWR<{ notes: NoteStub[] }>('/api/notes/tree', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  const isLoading = data === undefined;
  const notes = data?.notes ?? [];
  const processed = preprocessWikilinks(children);
  const tabsCtx = useTabsContext();

  const components = {
    a: ({ href, children: linkChildren, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) => {
      if (href?.startsWith('wikilink:')) {
        const name = decodeURIComponent(href.slice('wikilink:'.length));
        const resolvedId = resolveWikilink(name, notes);

        if (resolvedId) {
          const displayTitle = resolvedId.split('/').pop()?.replace(/\.md$/i, '') ?? name;
          return (
            <Link
              href={`/notes/${encodeURIComponent(resolvedId)}`}
              onClick={() => tabsCtx?.openTab(resolvedId, displayTitle)}
              style={{ color: 'var(--accent)', textDecoration: 'underline' }}
            >
              {linkChildren}
            </Link>
          );
        }

        // Still loading — neutral pending state so clicks aren't swallowed
        if (isLoading) {
          return (
            <span
              title={`Loading…`}
              style={{ color: 'rgba(255,255,255,0.35)', textDecoration: 'underline dotted', cursor: 'default' }}
            >
              {linkChildren}
            </span>
          );
        }

        // Loaded but unresolved
        return (
          <span
            title={`Note "${name}" not found`}
            onClick={(e) => e.stopPropagation()}
            style={{ color: '#f87171', textDecoration: 'underline dotted', cursor: 'help' }}
          >
            {linkChildren}
          </span>
        );
      }
      return <a href={href} {...props}>{linkChildren}</a>;
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components as any}>
      {processed}
    </ReactMarkdown>
  );
}
