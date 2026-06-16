'use client';
import { useRouter } from 'next/navigation';

function GitLabIllustration() {
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" fill="none" style={{ opacity: 0.18 }}>
      <path
        d="M50 88L8 55 18.5 18 32 54H68L81.5 18 92 55Z"
        stroke="#7F77DD"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M32 54L18.5 18 8 55"
        stroke="#7F77DD"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeOpacity="0.5"
      />
      <path
        d="M68 54L81.5 18 92 55"
        stroke="#7F77DD"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeOpacity="0.5"
      />
    </svg>
  );
}

export default function GitLabPage() {
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
      <GitLabIllustration />

      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 10,
          }}
        >
          GitLab Work Items
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 24 }}>
          Link notes to GitLab issues, epics, and milestones. Browse your project
          work items and attach them to notes without leaving REXFORM.
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
