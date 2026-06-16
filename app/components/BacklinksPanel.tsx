'use client';
import { useState, useEffect } from 'react';
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
  onCountLoaded?: (count: number) => void;
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 14 14" fill="none"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.18s' }}
    >
      <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  if (parts.length <= 1) return 'vault root';
  return parts.slice(0, -1).join(' / ');
}

export default function BacklinksPanel({ noteId, onCountLoaded }: Props) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const tabsCtx = useTabsContext();

  const { data, isLoading } = useSWR<{ backlinks: Backlink[] }>(
    `/api/notes/${encodeURIComponent(noteId)}/backlinks`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 }
  );

  const backlinks = data?.backlinks ?? [];
  const count = backlinks.length;

  useEffect(() => {
    if (data !== undefined) onCountLoaded?.(data.backlinks?.length ?? 0);
  }, [data, onCountLoaded]);

  function openNote(link: Backlink) {
    tabsCtx?.openTab(link.id, link.title);
    router.push(`/notes/${encodeURIComponent(link.id)}`);
  }

  return (
    <div style={{ marginTop: 48, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '0 0 10px', width: '100%',
          color: 'var(--text-secondary)',
        }}
      >
        <ChevronIcon open={open} />
        <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Linked mentions
        </span>
        {!isLoading && (
          <span style={{
            fontSize: 11, fontWeight: 500,
            padding: '1px 7px', borderRadius: 99,
            background: count > 0 ? 'rgba(127,119,221,0.18)' : 'rgba(255,255,255,0.07)',
            color: count > 0 ? 'var(--accent)' : 'var(--text-muted)',
            marginLeft: 2,
          }}>
            {count}
          </span>
        )}
      </button>

      {/* Body */}
      {open && (
        <div>
          {isLoading ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '8px 0' }}>
              Scanning vault…
            </div>
          ) : count === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', padding: '6px 0 16px' }}>
              No notes link here yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                        borderRadius: 8,
                        border: '1px solid transparent',
                        padding: '10px 12px',
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                          <FileIcon />
                        </span>
                        <span style={{
                          fontSize: 13.5, fontWeight: 500,
                          color: 'var(--accent)',
                          lineHeight: 1.3,
                        }}>
                          {link.title}
                        </span>
                      </div>
                      {/* Folder breadcrumb */}
                      <div style={{
                        fontSize: 11, color: 'var(--text-muted)',
                        marginBottom: link.snippet ? 6 : 0,
                        paddingLeft: 19,
                      }}>
                        {folder}
                      </div>
                      {/* Snippet with [[wikilink]] highlighting */}
                      {link.snippet && (
                        <p
                          style={{
                            fontSize: 12, color: 'var(--text-muted)',
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
      )}
    </div>
  );
}
