'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { useTabsContext } from '@/context/TabsContext';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface Backlink {
  id: string;
  title: string;
  snippet: string;
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

function LinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path
        d="M5 8.5L8.5 5M7.5 2.5h3v3M8.5 7.5v2.8a.7.7 0 0 1-.7.7H2.7a.7.7 0 0 1-.7-.7V4.2a.7.7 0 0 1 .7-.7H5.5"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BacklinksPanel({ noteId }: { noteId: string }) {
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
              {backlinks.map(link => (
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                      <span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
                        <LinkIcon />
                      </span>
                      <span style={{
                        fontSize: 13.5, fontWeight: 500,
                        color: 'var(--accent)',
                        lineHeight: 1.3,
                      }}>
                        {link.title}
                      </span>
                    </div>
                    {/* Snippet */}
                    {link.snippet && (
                      <p style={{
                        fontSize: 12, color: 'var(--text-muted)',
                        lineHeight: 1.6, margin: 0,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}>
                        {link.snippet}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
