'use client';
import { useRouter } from 'next/navigation';
import { useTabsContext } from '@/context/TabsContext';

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginRight: 5 }}>
      <rect x="1" y="0.5" width="7.5" height="11" rx="1" stroke="currentColor" strokeWidth="1.1" />
      <path d="M8.5 0.5 L10.5 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M8.5 0.5 L8.5 2.5 L10.5 2.5" stroke="currentColor" strokeWidth="1.1" fill="none" />
      <line x1="3" y1="5" x2="7" y2="5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="3" y1="7" x2="7" y2="7" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

export default function TabBar() {
  const ctx = useTabsContext();
  const router = useRouter();

  if (!ctx || ctx.tabs.length === 0) return null;

  const { tabs, activeTabId, closeTab, setActiveTab } = ctx;

  function handleTabClick(id: string) {
    setActiveTab(id);
    router.push(`/notes/${encodeURIComponent(id)}`);
  }

  function handleClose(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const idx = tabs.findIndex(t => t.id === id);
    const wasActive = id === activeTabId;
    closeTab(id);
    if (wasActive) {
      const remaining = tabs.filter(t => t.id !== id);
      if (remaining.length > 0) {
        const next = remaining[Math.max(0, idx - 1)];
        router.push(`/notes/${encodeURIComponent(next.id)}`);
      } else {
        router.push('/notes');
      }
    }
  }

  return (
    <div
      style={{
        height: 36,
        background: '#1a1b26',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'stretch',
        overflowX: 'auto',
        overflowY: 'hidden',
        flexShrink: 0,
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === activeTabId;
        return (
          <TabItem
            key={tab.id}
            tab={tab}
            isActive={isActive}
            onActivate={() => handleTabClick(tab.id)}
            onClose={(e) => handleClose(tab.id, e)}
          />
        );
      })}
    </div>
  );
}

interface TabItemProps {
  tab: { id: string; title: string };
  isActive: boolean;
  onActivate: () => void;
  onClose: (e: React.MouseEvent) => void;
}

function TabItem({ tab, isActive, onActivate, onClose }: TabItemProps) {
  return (
    <div
      onClick={onActivate}
      title={tab.title}
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        paddingLeft: 12,
        paddingRight: 8,
        cursor: 'pointer',
        background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
        borderBottom: isActive ? '2px solid #7F77DD' : '2px solid transparent',
        boxSizing: 'border-box',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        fontSize: 13,
        userSelect: 'none',
        position: 'relative',
      }}
      onMouseEnter={e => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
        const btn = (e.currentTarget as HTMLDivElement).querySelector('.tab-close') as HTMLElement;
        if (btn) btn.style.opacity = '1';
      }}
      onMouseLeave={e => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        const btn = (e.currentTarget as HTMLDivElement).querySelector('.tab-close') as HTMLElement;
        if (btn) btn.style.opacity = '0';
      }}
    >
      <FileIcon />
      <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {tab.title}
      </span>
      <button
        className="tab-close"
        onClick={onClose}
        style={{
          marginLeft: 6,
          width: 16,
          height: 16,
          borderRadius: 3,
          border: 'none',
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: isActive ? 1 : 0,
          fontSize: 11,
          lineHeight: 1,
          padding: 0,
          flexShrink: 0,
          transition: 'opacity 0.1s',
        }}
      >
        ×
      </button>
    </div>
  );
}
