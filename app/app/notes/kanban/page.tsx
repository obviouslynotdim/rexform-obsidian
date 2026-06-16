'use client';
import { useRouter } from 'next/navigation';

function KanbanIllustration() {
  return (
    <svg width="120" height="90" viewBox="0 0 120 90" fill="none" style={{ opacity: 0.18 }}>
      <rect x="4" y="4" width="32" height="82" rx="4" stroke="#7F77DD" strokeWidth="2" />
      <rect x="44" y="4" width="32" height="82" rx="4" stroke="#7F77DD" strokeWidth="2" />
      <rect x="84" y="4" width="32" height="82" rx="4" stroke="#7F77DD" strokeWidth="2" />
      <rect x="8" y="10" width="24" height="12" rx="2" fill="#7F77DD" />
      <rect x="8" y="28" width="24" height="12" rx="2" fill="#7F77DD" />
      <rect x="48" y="10" width="24" height="12" rx="2" fill="#7F77DD" />
      <rect x="48" y="28" width="24" height="12" rx="2" fill="#7F77DD" />
      <rect x="48" y="46" width="24" height="12" rx="2" fill="#7F77DD" />
      <rect x="88" y="10" width="24" height="12" rx="2" fill="#7F77DD" />
    </svg>
  );
}

export default function KanbanPage() {
  const router = useRouter();

  return (
    <div
      style={{
        height: '100%',
        background: 'var(--bg-base)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        padding: 40,
      }}
    >
      <KanbanIllustration />

      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 10,
          }}
        >
          Kanban
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 24 }}>
          Organize tasks with drag-and-drop boards. Create columns for your workflow
          and move notes between them as they progress.
        </p>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 18px',
            borderRadius: 8,
            background: 'rgba(127,119,221,0.12)',
            border: '1px solid rgba(127,119,221,0.3)',
            fontSize: 13,
            color: 'var(--accent)',
            fontWeight: 500,
            marginBottom: 24,
          }}
        >
          <span style={{ fontSize: 11 }}>⚡</span>
          Coming soon
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          You can disable this plugin in{' '}
          <button
            onClick={() => router.push('/settings')}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: 12,
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            Settings → Community Plugins
          </button>
        </p>
      </div>
    </div>
  );
}
