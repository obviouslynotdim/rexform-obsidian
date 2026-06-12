'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTabsContext, type Tab } from '@/context/TabsContext';

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

function GraphTabIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginRight: 5 }}>
      <circle cx="8" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="2.5" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="13.5" cy="12" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <line x1="8" y1="4.8" x2="2.5" y2="10.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="8" y1="4.8" x2="13.5" y2="10.2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <line x1="4.3" y1="12" x2="11.7" y2="12" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function tabHref(tab: Tab): string {
  if (tab.type === 'graph') return '/notes/graph';
  return `/notes/${encodeURIComponent(tab.id)}`;
}

export default function TabBar() {
  const ctx = useTabsContext();
  const router = useRouter();
  const dragTabId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  if (!ctx || ctx.tabs.length === 0) return null;

  const { tabs, activeTabId, closeTab, setActiveTab, reorderTabs } = ctx;

  function handleTabClick(tab: Tab) {
    setActiveTab(tab.id);
    router.push(tabHref(tab));
  }

  function handleClose(tab: Tab, e: React.MouseEvent) {
    e.stopPropagation();
    const idx = tabs.findIndex(t => t.id === tab.id);
    const wasActive = tab.id === activeTabId;
    closeTab(tab.id);
    if (wasActive) {
      const remaining = tabs.filter(t => t.id !== tab.id);
      if (remaining.length > 0) {
        const next = remaining[Math.max(0, idx - 1)];
        router.push(tabHref(next));
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
            isDragOver={dragOverId === tab.id}
            onActivate={() => handleTabClick(tab)}
            onClose={(e) => handleClose(tab, e)}
            onDragStart={() => { dragTabId.current = tab.id; }}
            onDragOver={(e) => { e.preventDefault(); setDragOverId(tab.id); }}
            onDragLeave={() => setDragOverId(null)}
            onDrop={() => {
              setDragOverId(null);
              if (dragTabId.current && dragTabId.current !== tab.id) {
                reorderTabs(dragTabId.current, tab.id);
              }
              dragTabId.current = null;
            }}
          />
        );
      })}
    </div>
  );
}

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  isDragOver: boolean;
  onActivate: () => void;
  onClose: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
}

function TabItem({ tab, isActive, isDragOver, onActivate, onClose, onDragStart, onDragOver, onDragLeave, onDrop }: TabItemProps) {
  return (
    <div
      draggable
      onClick={onActivate}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      title={tab.title}
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 12,
        paddingRight: 8,
        cursor: 'grab',
        background: isActive ? 'rgba(255,255,255,0.08)' : isDragOver ? 'rgba(255,255,255,0.06)' : 'transparent',
        color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
        borderBottom: isActive ? '2px solid #7F77DD' : '2px solid transparent',
        borderLeft: isDragOver ? '2px solid #7F77DD' : '2px solid transparent',
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
        if (!isActive && !isDragOver) (e.currentTarget as HTMLDivElement).style.background = 'transparent';
        const btn = (e.currentTarget as HTMLDivElement).querySelector('.tab-close') as HTMLElement;
        if (btn) btn.style.opacity = '0';
      }}
    >
      {tab.type === 'graph' ? <GraphTabIcon /> : <FileIcon />}
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
