'use client';
import { useEffect, useRef } from 'react';
import type { ContextMenuState } from './types';

const itemStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '6px 16px',
  fontSize: '13px',
  color: 'rgba(255,255,255,0.8)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
};

const sepStyle: React.CSSProperties = {
  height: 1,
  background: 'rgba(255,255,255,0.08)',
  margin: '4px 0',
};

const hoverBg = 'rgba(255,255,255,0.08)';

interface ContextMenuProps {
  menu: ContextMenuState;
  onClose: () => void;
}

export default function ContextMenu({ menu, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const hasCreateGroup = !!(menu.onNewNote || menu.onNewFolder);
  const hasGraphGroup = !!menu.onOpenGraph;
  const hasEditGroup = !!(menu.onRename || (menu.type === 'file' && menu.onMove));
  const hasDeleteGroup = !!menu.onDelete;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: menu.x,
        top: menu.y,
        background: '#1e2030',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '8px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        zIndex: 9999,
        minWidth: 160,
        padding: '4px 0',
        overflow: 'hidden',
      }}
    >
      {/* Create group */}
      {menu.onNewNote && (
        <button
          style={itemStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          onClick={() => { menu.onNewNote!(); onClose(); }}
        >New Note here</button>
      )}
      {menu.onNewFolder && (
        <button
          style={itemStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          onClick={() => { menu.onNewFolder!(); onClose(); }}
        >New Folder here</button>
      )}

      {/* Graph group */}
      {hasGraphGroup && (
        <>
          {hasCreateGroup && <div style={sepStyle} />}
          <button
            style={itemStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => { menu.onOpenGraph!(); onClose(); }}
          >Open in Graph</button>
        </>
      )}

      {/* Edit group */}
      {hasEditGroup && (hasCreateGroup || hasGraphGroup) && <div style={sepStyle} />}
      {menu.onRename && (
        <button
          style={itemStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          onClick={() => { menu.onRename!(); onClose(); }}
        >Rename</button>
      )}
      {menu.type === 'file' && menu.onMove && (
        <button
          style={itemStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          onClick={() => { menu.onMove!(); onClose(); }}
        >Move to folder</button>
      )}

      {/* Delete group */}
      {hasDeleteGroup && (
        <>
          <div style={sepStyle} />
          <button
            style={{ ...itemStyle, color: '#f87171' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            onClick={() => { menu.onDelete!(); onClose(); }}
          >Delete</button>
        </>
      )}
    </div>
  );
}
