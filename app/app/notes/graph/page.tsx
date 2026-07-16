'use client';
import { useState, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import GraphView from '@/components/GraphView';
import NotePreview from '@/components/NotePreview';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface GraphNode { id: string; title: string; path?: string; linkCount: number; type?: string }
interface GraphEdge { source: string; target: string }
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[] }

const SEP: React.CSSProperties = { height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' };
const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6,
};

function GraphPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folder = searchParams.get('folder');
  // `?open=<noteId>` pre-selects a note so the preview panel opens on arrival
  // (used by the first-time onboarding redirect). Independent of `?folder=`,
  // so both params work together, e.g. /notes/graph?folder=X&open=Y.
  const openParam = searchParams.get('open');

  // Mount-only initialisers: derive the initial selection from `?open=`. We do
  // NOT sync these to `openParam` on later renders, otherwise closing the panel
  // (✕) would immediately reopen it while the param lingers in the URL.
  const [selectedNote, setSelectedNote] = useState<string | null>(openParam);
  const [selectedNoteTitle, setSelectedNoteTitle] = useState(() =>
    openParam ? openParam.replace(/\.md$/i, '').split('/').pop() ?? openParam : ''
  );
  const [showAnalytics, setShowAnalytics] = useState(false);

  const swrKey = folder
    ? `/api/notes/graph?folder=${encodeURIComponent(folder)}`
    : '/api/notes/graph';

  const { data } = useSWR<GraphData>(swrKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  // Analytics only consider real notes and note↔note links — the API also
  // returns tag/attachment/unresolved nodes for the graph's filter toggles.
  const noteNodes = useMemo(
    () => (data?.nodes ?? []).filter(n => (n.type ?? 'note') === 'note'),
    [data]
  );
  const noteDegree = useMemo(() => {
    const ids = new Set(noteNodes.map(n => n.id));
    const deg: Record<string, number> = {};
    (data?.edges ?? []).forEach(e => {
      if (ids.has(e.source) && ids.has(e.target)) {
        deg[e.source] = (deg[e.source] || 0) + 1;
        deg[e.target] = (deg[e.target] || 0) + 1;
      }
    });
    return deg;
  }, [data, noteNodes]);
  const noteEdgeCount = useMemo(
    () => Object.values(noteDegree).reduce((a, b) => a + b, 0) / 2,
    [noteDegree]
  );
  const orphans = useMemo(
    () => noteNodes.filter(n => !noteDegree[n.id]),
    [noteNodes, noteDegree]
  );
  const topConnected = useMemo(
    () => [...noteNodes]
      .sort((a, b) => (noteDegree[b.id] || 0) - (noteDegree[a.id] || 0))
      .slice(0, 6)
      .filter(n => (noteDegree[n.id] || 0) > 0),
    [noteNodes, noteDegree]
  );

  const folderLabel = folder ? folder.split('/').pop() ?? folder : null;

  const handleNodeSelect = (id: string, title: string) => {
    setSelectedNote(id);
    setSelectedNoteTitle(title);
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* Analytics sidebar */}
      {showAnalytics && (
        <div style={{
          width: 228, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.07)',
          background: 'var(--bg-surface)',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '0 14px',
            height: 32, flexShrink: 0,
            display: 'flex', alignItems: 'center',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            fontSize: 11, fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '0.05em',
          }}>
            Analytics
          </div>

          {/* Overview */}
          <div style={{ padding: '12px 14px' }}>
            <div style={SECTION_LABEL}>Overview</div>
            {[
              { label: 'Notes', value: data ? noteNodes.length : '…' },
              { label: 'Links', value: data ? noteEdgeCount : '…' },
              { label: 'Orphans', value: data ? orphans.length : '…' },
            ].map(({ label, value }) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 4, fontSize: 12,
              }}>
                <span style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</span>
                <span style={{ color: 'rgba(255,255,255,0.85)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
              </div>
            ))}
          </div>

          {topConnected.length > 0 && (
            <>
              <div style={SEP} />
              <div style={{ padding: '12px 14px' }}>
                <div style={SECTION_LABEL}>Most Connected</div>
                {topConnected.map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleNodeSelect(n.id, n.title)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
                      padding: '3px 0', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      fontSize: 12, color: 'rgba(255,255,255,0.75)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    }}>{n.title}</span>
                    <span style={{
                      fontSize: 11, color: '#7F77DD',
                      marginLeft: 8, flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                    }}>{noteDegree[n.id] || 0}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {orphans.length > 0 && (
            <>
              <div style={SEP} />
              <div style={{ padding: '12px 14px' }}>
                <div style={SECTION_LABEL}>Orphan Notes <span style={{ fontVariantNumeric: 'tabular-nums' }}>({orphans.length})</span></div>
                {orphans.slice(0, 12).map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleNodeSelect(n.id, n.title)}
                    style={{
                      display: 'block', width: '100%',
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      padding: '3px 0', textAlign: 'left',
                      fontSize: 12, color: 'rgba(255,255,255,0.45)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >{n.title}</button>
                ))}
                {orphans.length > 12 && (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                    +{orphans.length - 12} more
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Graph panel */}
      <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
        {/* Custom header (replaces GraphView's internal showHeader) */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 32, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 12px',
          background: 'rgba(0,0,0,0.3)',
        }}>
          {/* Analytics toggle */}
          <button
            onClick={() => setShowAnalytics(a => !a)}
            title="Toggle analytics"
            style={{
              width: 24, height: 24, flexShrink: 0, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: showAnalytics ? 'rgba(127,119,221,0.18)' : 'transparent',
              border: '1px solid ' + (showAnalytics ? 'rgba(127,119,221,0.4)' : 'rgba(255,255,255,0.12)'),
              borderRadius: 4,
              color: showAnalytics ? '#7F77DD' : 'rgba(255,255,255,0.45)',
            }}
          >
            {/* bar-chart icon */}
            <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
              <rect x="1" y="5" width="3" height="7" rx="0.5" />
              <rect x="5" y="2" width="3" height="10" rx="0.5" />
              <rect x="9" y="7" width="3" height="5" rx="0.5" />
            </svg>
          </button>

          <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.65)' }}>
            Graph View
          </span>

          {folderLabel && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 11,
              background: 'rgba(127,119,221,0.14)',
              border: '1px solid rgba(127,119,221,0.28)',
              borderRadius: 4,
              padding: '1px 6px 1px 8px',
              color: '#7F77DD',
            }}>
              {folderLabel}
              <button
                onClick={() => { router.push('/notes/graph'); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(127,119,221,0.6)', padding: 0, fontSize: 13, lineHeight: 1,
                  display: 'flex', alignItems: 'center',
                }}
                title="Clear folder filter"
              >✕</button>
            </span>
          )}

          <div style={{ flex: 1 }} />

          {data && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
              {noteNodes.length} notes · {noteEdgeCount} links
            </span>
          )}
        </div>

        {/* Graph canvas — sits below the 32px header */}
        <div style={{ position: 'absolute', inset: '32px 0 0 0' }}>
          <GraphView
            folderFilter={folder ?? undefined}
            onNodeClick={handleNodeSelect}
            activeNoteId={selectedNote ?? undefined}
          />
        </div>
      </div>

      {/* Note preview panel */}
      {selectedNote && (
        <div style={{
          width: 480, flexShrink: 0,
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          background: 'var(--bg-surface)',
          overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', height: 44,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            <span style={{
              fontSize: 13, color: 'rgba(255,255,255,0.6)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
            }}>
              {selectedNoteTitle}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
              <button
                onClick={() => router.push(`/notes/${encodeURIComponent(selectedNote)}`)}
                style={{
                  fontSize: 12, color: 'var(--accent)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '4px 8px', borderRadius: 4,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
                  (e.currentTarget as HTMLButtonElement).style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)';
                }}
              >
                Open ↗
              </button>
              <button
                onClick={() => setSelectedNote(null)}
                style={{
                  fontSize: 16, color: 'rgba(255,255,255,0.4)',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  lineHeight: 1, padding: 4, borderRadius: 4,
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)'; }}
              >
                ✕
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <NotePreview noteId={selectedNote} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense>
      <GraphPageContent />
    </Suspense>
  );
}
