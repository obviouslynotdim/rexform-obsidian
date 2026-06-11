'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import useSWR from 'swr';

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
  return (
    notes.find((n) => {
      const filename = n.path.split('/').pop()?.replace(/\.md$/i, '') ?? '';
      return filename.toLowerCase() === lower;
    })?.id ?? null
  );
}

export default function WikiMarkdown({ children }: { children: string }) {
  const { data } = useSWR<{ notes: NoteStub[] }>('/api/notes/tree', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  const notes = data?.notes ?? [];
  const processed = preprocessWikilinks(children);

  const components = {
    a: ({ href, children: linkChildren, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children?: React.ReactNode }) => {
      if (href?.startsWith('wikilink:')) {
        const name = decodeURIComponent(href.slice('wikilink:'.length));
        const resolvedId = resolveWikilink(name, notes);
        if (resolvedId) {
          return (
            <Link
              href={`/notes/${encodeURIComponent(resolvedId)}`}
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
