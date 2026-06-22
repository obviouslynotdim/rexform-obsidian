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
  if (byFilename) return byFilename.id;

  // 2. Normalized match — hyphens/underscores treated as spaces
  const lowerNorm = norm(lower);
  const byNorm = notes.find((n) => {
    const filename = n.path.split('/').pop()?.replace(/\.md$/i, '') ?? '';
    return norm(filename) === lowerNorm;
  });
  if (byNorm) return byNorm.id;

  // 3. Full id match (case-insensitive, strip .md from the stored id for comparison only)
  const byId = notes.find((n) => n.id.replace(/\.md$/i, '').toLowerCase() === lower);
  if (byId) return byId.id;

  // 4. Note title match (case-insensitive) — catches notes whose title differs from filename
  const byTitle = notes.find((n) => n.title && n.title.toLowerCase() === lower);
  if (byTitle) return byTitle.id;

  // 5. Partial path match — [[subfolder/note]] matches "vault/subfolder/note.md"
  const byPartialPath = notes.find((n) => {
    const pathNoExt = n.path.replace(/\.md$/i, '').toLowerCase();
    return pathNoExt === lower || pathNoExt.endsWith('/' + lower);
  });
  return byPartialPath?.id ?? null;
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
          // Strip .md for a clean URL; note page retries with .md suffix if direct lookup fails
          const urlId = resolvedId.replace(/\.md$/i, '');
          return (
            <Link
              href={`/notes/${encodeURIComponent(urlId)}`}
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
              title="Loading…"
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
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={components as any}
      // react-markdown v9's default urlTransform strips non-allowlisted
      // protocols (including our `wikilink:` sentinel) to ''. Identity transform
      // lets wikilink: URLs reach the custom <a> renderer above.
      urlTransform={(url) => url}
    >
      {processed}
    </ReactMarkdown>
  );
}
