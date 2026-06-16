'use client';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useTabsContext } from '@/context/TabsContext';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Backlink {
  id: string;
  title: string;
  snippet: string;
}

interface Props {
  noteId: string;
}

function FileIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <rect x="1.5" y="0.5" width="7.5" height="11.5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <path d="M9 0.5L11.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9 0.5v2.5h2.5" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round" />
      <line x1="3" y1="5.5" x2="8.5" y2="5.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="3" y1="7.5" x2="7" y2="7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function renderSnippet(snippet: string): { __html: string } {
  // Escape HTML to prevent XSS, then highlight [[wikilinks]]
  const escaped = snippet
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const highlighted = escaped.replace(
    /\[\[([^\]]+)\]\]/g,
    '<span style="color:var(--accent);font-weight:500">$1</span>'
  );
  return { __html: highlighted };
}

function folderLabel(id: string): string {
  const parts = id.split('/');
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join(' / ');
}

export default function BacklinksPanel({ noteId }: Props) {
  const router = useRouter();
  const tabsCtx = useTabsContext();

  const { data, isLoading } = useSWR<{ backlinks: Backlink[] }>(
    `/api/notes/${encodeURIComponent(noteId)}/backlinks`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );

  const backlinks = data?.backlinks ?? [];
  const count = backlinks.length;

  function openNote(link: Backlink) {
    tabsCtx?.openTab(link.id, link.title);
    const urlId = link.id.replace(/\.md$/i, '');
    router.push(`/notes/${encodeURIComponent(urlId)}`);
  }

  return (
    <div style={{ padding: '12px 8px' }}>
      {isLoading ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '8px 8px' }}>
          Scanning…
        </div>
      ) : count === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '6px 8px' }}>
          No backlinks
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {backlinks.map(link => {
            const folder = folderLabel(link.id);
            return (
              <button
                key={link.id}
                onClick={() => openNote(link)}
                style={{
                  textAlign: 'left', background: 'none', border: 'none',
                  cursor: 'pointer', padding: 0, width: '100%',
                }}
              >
                <div
                  style={{
                    borderRadius: 6,
                    border: '1px solid transparent',
                    padding: '8px 10px',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.background = 'none';
                    (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
                  }}
                >
                  {/* Title row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: folder || link.snippet ? 3 : 0 }}>
                    <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <FileIcon />
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)', lineHeight: 1.3 }}>
                      {link.title}
                    </span>
                  </div>
                  {/* Folder breadcrumb — omit for root-level notes */}
                  {folder && (
                    <div style={{
                      fontSize: 11, color: 'var(--text-muted)',
                      marginBottom: link.snippet ? 5 : 0,
                      paddingLeft: 19,
                    }}>
                      {folder}
                    </div>
                  )}
                  {/* Snippet with [[wikilink]] highlighting */}
                  {link.snippet && (
                    <p
                      style={{
                        fontSize: 11.5, color: 'var(--text-muted)',
                        lineHeight: 1.6, margin: 0,
                        paddingLeft: 19,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                      dangerouslySetInnerHTML={renderSnippet(link.snippet)}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
