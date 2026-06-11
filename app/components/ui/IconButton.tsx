'use client';
import { useState } from 'react';

interface IconButtonProps {
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  tooltip?: string;
}

export default function IconButton({ icon, active = false, onClick, tooltip }: IconButtonProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active
            ? 'rgba(255,255,255,0.1)'
            : hovered
            ? 'rgba(255,255,255,0.06)'
            : 'transparent',
          color: active ? '#fff' : 'rgba(255,255,255,0.4)',
          transition: 'background 0.12s, color 0.12s',
          flexShrink: 0,
        }}
      >
        {icon}
      </button>
      {tooltip && hovered && (
        <div
          style={{
            position: 'absolute',
            left: 38,
            top: '50%',
            transform: 'translateY(-50%)',
            background: '#1e2030',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 5,
            padding: '3px 8px',
            fontSize: 12,
            color: 'rgba(255,255,255,0.8)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 1000,
          }}
        >
          {tooltip}
        </div>
      )}
    </div>
  );
}
