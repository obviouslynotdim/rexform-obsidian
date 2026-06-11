'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TabsProvider } from '@/context/TabsContext';
import TabBar from '@/components/TabBar';
import NotesSidebar from '@/components/NotesSidebar';
import IconButton from '@/components/ui/IconButton';

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

export default function NotesShell({ children }: { children: React.ReactNode }) {
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const router = useRouter();

  return (
    <TabsProvider>
      <div
        style={{ display: 'flex', height: 'calc(100vh - 56px)', background: 'var(--bg-base)' }}
      >
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
            active={false}
            onClick={() => router.push('/graph')}
            tooltip="Graph view"
          />
        </div>

        {/* Sidebar */}
        <div style={{ display: sidebarVisible ? 'flex' : 'none', flexDirection: 'column' }}>
          <NotesSidebar />
        </div>

        {/* Main content column: TabBar on top, then page content */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <TabBar />
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            {children}
          </div>
        </div>
      </div>
    </TabsProvider>
  );
}
