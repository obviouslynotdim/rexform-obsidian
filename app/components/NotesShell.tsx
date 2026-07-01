'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import useSWR from 'swr';
import { TabsProvider, useTabsContext } from '@/context/TabsContext';
import TabBar from '@/components/TabBar';
import NotesSidebar from '@/components/NotesSidebar';
import IconButton from '@/components/ui/IconButton';
import SearchModal from '@/components/SearchModal';
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

// ─── Shell inner (needs to be inside TabsProvider to call useTabsContext) ─────

function NotesShellInner({ children }: { children: React.ReactNode }) {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  // Resizable file/note split — the sidebar wrapper owns the width; NotesSidebar
  // is w-full so it fills whatever we set here. Clamped and persisted.
  const [sidebarWidth, setSidebarWidth] = useState(288); // 288px = the old w-72
  const resizingRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const tabsCtx = useTabsContext();

  useEffect(() => {
    const s = localStorage.getItem('notes.sidebarWidth');
    if (s) {
      const n = parseInt(s, 10);
      if (!Number.isNaN(n)) setSidebarWidth(Math.min(560, Math.max(200, n)));
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('notes.sidebarWidth', String(sidebarWidth));
  }, [sidebarWidth]);

  // Drag-to-resize: the sidebar starts after the 40px icon strip, so its width
  // is the cursor's clientX minus that offset, clamped to a sane range.
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!resizingRef.current) return;
      setSidebarWidth(Math.min(560, Math.max(200, e.clientX - 40)));
    }
    function onUp() {
      if (!resizingRef.current) return;
      resizingRef.current = false;
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

      {/* Main content column */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <TabBar />
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function NotesShell({ children }: { children: React.ReactNode }) {
  return (
    <TabsProvider>
      <NotesShellInner>{children}</NotesShellInner>
    </TabsProvider>
  );
}
