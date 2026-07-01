'use client';
import { useEffect, useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import useSWR from 'swr';
import { useTabsContext } from '@/context/TabsContext';
import { rehypeCollapsibleHeadings } from '@/lib/rehype/collapsible-headings';

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

/**
 * Renders a ```mermaid fenced block as an SVG diagram.
 *
 * Client-only: `mermaid` touches `document`, so it is dynamically imported
 * inside an effect (which never runs during SSR). On the server and on the
 * first client paint we render a lightweight placeholder, then swap in the SVG
 * once rendering completes.
 */
function Mermaid({ chart }: { chart: string }) {
  const [svg, setSvg] = useState('');
  const [failed, setFailed] = useState(false);
  // Stable, SSR-safe id; mermaid uses it as a DOM/CSS id so strip non-word chars.
  const rawId = useId();
  const id = 'mermaid-' + rawId.replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    let cancelled = false;
    setSvg('');
    setFailed(false);

    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'inherit',
          themeVariables: {
            background: '#1a1a2e',
            primaryColor: '#252538',
            primaryTextColor: '#e8e8f0',
            primaryBorderColor: '#7F77DD',
            lineColor: '#7F77DD',
            secondaryColor: '#2a2a40',
            tertiaryColor: '#1f1f30',
            fontSize: '14px',
          },
        });
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => { cancelled = true; };
  }, [chart, id]);

  // Render failed — fall back to showing the raw diagram source as a code block.
  if (failed) {
    return (
      <pre
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 12,
          overflowX: 'auto',
          fontSize: 13,
        }}
      >
        <code>{chart}</code>
      </pre>
    );
  }

  // Not rendered yet (SSR / first paint) — neutral placeholder.
  if (!svg) {
    return (
      <div
        style={{
          display: 'flex', justifyContent: 'center',
          margin: '16px 0', padding: '24px 0',
          color: 'rgba(255,255,255,0.3)', fontSize: 13,
        }}
      >
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="mermaid-diagram"
      style={{ display: 'flex', justifyContent: 'center', margin: '16px 0', overflowX: 'auto' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

// Styles for the collapsible heading fold UI injected once per WikiMarkdown
// render. Scoped to .rexform-fold so they don't affect other <details> elements.
const FOLD_STYLES = `
  details.rexform-fold > summary {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    width: 100%;
    gap: 4px;
  }
  details.rexform-fold > summary::marker,
  details.rexform-fold > summary::-webkit-details-marker {
    display: none;
  }
  /* Let the heading fill the row so its prose border-bottom (the divider
     under H1/H2) spans the full column width, not just the text. */
  details.rexform-fold > summary > :is(h1, h2, h3, h4, h5, h6) {
    flex: 1;
    margin: 0;
  }
  .rexform-fold-chevron {
    font-size: 11px;
    color: rgba(255, 255, 255, 0.9);
    opacity: 0;
    flex-shrink: 0;
    display: inline-block;
    transition: transform 0.15s ease, opacity 0.15s ease;
    user-select: none;
    line-height: 1;
  }
  details.rexform-fold[open] > summary .rexform-fold-chevron {
    transform: rotate(90deg);
  }
  details.rexform-fold > summary:hover .rexform-fold-chevron {
    opacity: 1;
  }
`;

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

    // Mermaid fenced blocks (```mermaid) render as diagrams; all other code
    // renders as a normal <code>.
    code: ({ className, children: codeChildren, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
      const cls = className || '';
      if (cls.includes('language-mermaid')) {
        return <Mermaid chart={String(codeChildren).replace(/\n$/, '')} />;
      }
      return <code className={className} {...props}>{codeChildren}</code>;
    },

    // The Mermaid diagram is block-level on its own, so don't wrap it in <pre>
    // (a <div> inside <pre> is invalid). Other fenced blocks keep their <pre>.
    pre: ({ children: preChildren, ...props }: React.HTMLAttributes<HTMLPreElement> & { children?: React.ReactNode }) => {
      const child: any = Array.isArray(preChildren) ? preChildren[0] : preChildren;
      const childCls = child?.props?.className;
      if (typeof childCls === 'string' && childCls.includes('language-mermaid')) {
        return <>{preChildren}</>;
      }
      return <pre {...props}>{preChildren}</pre>;
    },
  };

  return (
    <>
      {/* dangerouslySetInnerHTML so the `>` combinators aren't HTML-escaped on
          the server (which mismatches the client and triggers a hydration error). */}
      <style dangerouslySetInnerHTML={{ __html: FOLD_STYLES }} />
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeCollapsibleHeadings]}
        components={components as any}
        // react-markdown v9's default urlTransform strips non-allowlisted
        // protocols (including our `wikilink:` sentinel) to ''. Identity transform
        // lets wikilink: URLs reach the custom <a> renderer above.
        urlTransform={(url) => url}
      >
        {processed}
      </ReactMarkdown>
    </>
  );
}
