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

  const hasMeta = menu.onNewNote || menu.onNewFolder;
  const hasActions = menu.onRename || menu.onDelete;

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
      {hasMeta && hasActions && (
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
      )}
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
      {menu.onDelete && (
        <>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
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
