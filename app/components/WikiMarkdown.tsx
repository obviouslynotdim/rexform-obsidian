'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import useSWR from 'swr';
import { useTabsContext } from '@/context/TabsContext';

interface NoteStub { id: string; path: string }

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

  // 3. Full id match (case-insensitive, strip .md)
  const byId = notes.find((n) => n.id.replace(/\.md$/i, '').toLowerCase() === lower);
  return byId?.id ?? null;
}

export default function WikiMarkdown({ children }: { children: string }) {
  const { data } = useSWR<{ notes: NoteStub[] }>('/api/notes/tree', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
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
        return (
          <span
            title={`Note "${name}" not found`}
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
