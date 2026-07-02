'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import useSWR from 'swr';
import { TabsProvider, useTabsContext } from '@/context/TabsContext';
import { RightPanelProvider, useRightPanel } from '@/context/RightPanelContext';
import TabBar from '@/components/TabBar';
import NotesSidebar from '@/components/NotesSidebar';
import IconButton from '@/components/ui/IconButton';
import SearchModal from '@/components/SearchModal';
import OutlinePanel, { OutlineIcon } from '@/components/OutlinePanel';
const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Icon strip SVGs ──────────────────────────────────────────────────────────

function FilesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="5" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="6" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="10" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="10" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function GraphIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="2.5" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="13.5" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <line x1="8" y1="4.8" x2="2.5" y2="10.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="8" y1="4.8" x2="13.5" y2="10.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="4.3" y1="12" x2="11.7" y2="12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function KanbanIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1.5" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="6" y="1.5" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="11" y="1.5" width="4" height="13" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="1.8" y="3" width="2.4" height="2" rx="0.4" fill="currentColor" opacity="0.6" />
      <rect x="6.8" y="3" width="2.4" height="2" rx="0.4" fill="currentColor" opacity="0.6" />
      <rect x="6.8" y="7" width="2.4" height="2" rx="0.4" fill="currentColor" opacity="0.6" />
      <rect x="11.8" y="3" width="2.4" height="2" rx="0.4" fill="currentColor" opacity="0.6" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="3" width="13" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1.5" y1="7" x2="14.5" y2="7" stroke="currentColor" strokeWidth="1" />
      <line x1="5" y1="1.5" x2="5" y2="4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="11" y1="1.5" x2="11" y2="4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="5" cy="10" r="0.9" fill="currentColor" />
      <circle cx="8" cy="10" r="0.9" fill="currentColor" />
      <circle cx="11" cy="10" r="0.9" fill="currentColor" />
    </svg>
  );
}

function GitLabIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 17L2 10.5 4.5 3.5 7 10H13L15.5 3.5 18 10.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.3" />
      <line x1="9.5" y1="9.5" x2="13" y2="13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// ─── Right sidebar content (Outline + Backlinks) ─────────────────────────────
// Its own component so only IT re-renders when the note view republishes the
// outline (per keystroke in edit modes) — the rest of the shell stays put.

const panelHeaderStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
  textTransform: 'uppercase', color: 'var(--text-secondary)', flexShrink: 0,
};

function RightSidebarContent() {
  const panel = useRightPanel()?.panel ?? null;
  if (!panel) {
    return (
      <p style={{ padding: '14px 12px', fontSize: 12.5, color: 'var(--text-muted)' }}>
        Open a note to see its outline.
      </p>
    );
  }
  return (
    <>
      <div style={panelHeaderStyle}>Outline</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <OutlinePanel outline={panel.outline} onJump={panel.onJump} />
      </div>
    </>
  );
}

// ─── Shell inner (needs to be inside TabsProvider to call useTabsContext) ─────

function NotesShellInner({ children }: { children: React.ReactNode }) {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  // Resizable file/note split — the sidebar wrapper owns the width; NotesSidebar
  // is w-full so it fills whatever we set here. Clamped and persisted.
  const [sidebarWidth, setSidebarWidth] = useState(288); // 288px = the old w-72
  const resizingRef = useRef(false);
  // Right panel (Outline) — a real flex column reserved in the row, never an
  // overlay. Closed by default (Obsidian-style); open state + width persisted,
  // mirrored from the left split.
  const [rightOpen, setRightOpen] = useState(false);
  const [rightWidth, setRightWidth] = useState(280);
  const resizingRightRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const tabsCtx = useTabsContext();

  useEffect(() => {
    const s = localStorage.getItem('notes.sidebarWidth');
    if (s) {
      const n = parseInt(s, 10);
      if (!Number.isNaN(n)) setSidebarWidth(Math.min(560, Math.max(200, n)));
    }
    const ro = localStorage.getItem('notes.rightOpen');
    if (ro != null) setRightOpen(ro === '1');
    const rw = Number(localStorage.getItem('notes.rightWidth'));
    if (rw >= 200 && rw <= 460) setRightWidth(rw);
  }, []);
  useEffect(() => {
    localStorage.setItem('notes.sidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);
  useEffect(() => {
    localStorage.setItem('notes.rightOpen', rightOpen ? '1' : '0');
  }, [rightOpen]);
  useEffect(() => {
    localStorage.setItem('notes.rightWidth', String(rightWidth));
  }, [rightWidth]);

  // Drag-to-resize: the sidebar starts after the 40px icon strip, so its width
  // is the cursor's clientX minus that offset. The right panel is flush to the
  // viewport's right edge, so its width is (viewport width − cursor x). Both
  // clamped to sane ranges.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (resizingRef.current) {
        setSidebarWidth(Math.min(560, Math.max(200, e.clientX - 40)));
      }
      if (resizingRightRef.current) {
        setRightWidth(Math.min(460, Math.max(200, window.innerWidth - e.clientX)));
      }
    }
    function onUp() {
      if (!resizingRef.current && !resizingRightRef.current) return;
      resizingRef.current = false;
      resizingRightRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const { data: pluginsData } = useSWR('/api/user/plugins', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
    fallbackData: { plugins: { kanban: false, calendar: false, gitlab: false } },
  });
  const installed: string[] = pluginsData?.installed ?? [];
  const enabled: Record<string, boolean> = pluginsData?.enabled ?? {};

  const isGraphActive    = pathname === '/notes/graph';
  const isKanbanActive   = pathname === '/notes/kanban';
  const isCalendarActive = pathname === '/notes/calendar';
  const isGitLabActive   = pathname === '/notes/gitlab';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', background: 'var(--bg-base)' }}>

      {/* Icon strip */}
      <div
        style={{
          width: 40,
          background: 'var(--bg-surface)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
          gap: 4,
          flexShrink: 0,
        }}
      >
        <IconButton
          icon={<FilesIcon />}
          active={sidebarVisible}
          onClick={() => setSidebarVisible(v => !v)}
          tooltip="Files"
        />
        <IconButton
          icon={<GraphIcon />}
          active={isGraphActive}
          onClick={() => {
            tabsCtx?.openTab('graph', 'Graph view', 'graph');
            router.push('/notes/graph');
          }}
          tooltip="Graph view"
        />

        {installed.includes('kanban') && enabled['kanban'] && (
          <IconButton
            icon={<KanbanIcon />}
            active={isKanbanActive}
            onClick={() => {
              tabsCtx?.openTab('kanban', 'Kanban', 'kanban');
              router.push('/notes/kanban');
            }}
            tooltip="Kanban"
          />
        )}

        {installed.includes('calendar') && enabled['calendar'] && (
          <IconButton
            icon={<CalendarIcon />}
            active={isCalendarActive}
            onClick={() => {
              tabsCtx?.openTab('calendar', 'Calendar', 'calendar');
              router.push('/notes/calendar');
            }}
            tooltip="Calendar"
          />
        )}

        {installed.includes('gitlab') && enabled['gitlab'] && (
          <IconButton
            icon={<GitLabIcon />}
            active={isGitLabActive}
            onClick={() => {
              tabsCtx?.openTab('gitlab', 'GitLab', 'gitlab');
              router.push('/notes/gitlab');
            }}
            tooltip="GitLab Work Items"
          />
        )}

        <IconButton
          icon={<SearchIcon />}
          active={searchOpen}
          onClick={() => setSearchOpen(true)}
          tooltip="Search (Ctrl+K)"
        />
      </div>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Sidebar — width owned here so it can be dragged; NotesSidebar is w-full. */}
      <div
        style={{
          display: sidebarVisible ? 'flex' : 'none',
          flexDirection: 'column',
          width: sidebarWidth,
          flexShrink: 0,
        }}
      >
        <NotesSidebar />
      </div>

      {/* Drag handle between the sidebar and the note column */}
      {sidebarVisible && (
        <div
          onMouseDown={() => {
            resizingRef.current = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
          }}
          title="Drag to resize"
          style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: 'transparent' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(127,119,221,0.3)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        />
      )}

      {/* Main content column — flex:1 minWidth:0 so it SHRINKS to make room for
          the right panel instead of being covered by it. */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        {/* Header row: tabs + top-right controls (Obsidian-style). The right-
            panel toggle lives HERE, in the flow — never floating over the note. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            height: 36,
            flexShrink: 0,
            background: '#1a1b26',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <TabBar />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 6px', flexShrink: 0 }}>
            <IconButton
              icon={<OutlineIcon />}
              active={rightOpen}
              onClick={() => setRightOpen(v => !v)}
              tooltip="Outline"
            />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>

      {/* Right panel — a normal flex child with reserved width beside MAIN.
          When closed, it (and its handle) unmounts so MAIN reclaims the width. */}
      {rightOpen && (
        <>
          {/* Drag handle — the left-split handle mirrored */}
          <div
            onMouseDown={() => {
              resizingRightRef.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
            title="Drag to resize"
            style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: 'transparent', borderLeft: '1px solid rgba(255,255,255,0.06)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(127,119,221,0.3)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          />
          <div
            style={{
              width: rightWidth,
              flexShrink: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--bg-surface)',
            }}
          >
            <RightSidebarContent />
          </div>
        </>
      )}
    </div>
  );
}

export default function NotesShell({ children }: { children: React.ReactNode }) {
  return (
    <TabsProvider>
      <RightPanelProvider>
        <NotesShellInner>{children}</NotesShellInner>
      </RightPanelProvider>
    </TabsProvider>
  );
}
