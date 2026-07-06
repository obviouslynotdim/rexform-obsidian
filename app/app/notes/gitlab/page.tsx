'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate as globalMutate } from 'swr';
import { useTabsContext } from '@/context/TabsContext';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface GitLabConfigStatus { connected: boolean; host?: string; username?: string; error?: string }
interface Project { id: number; name: string; pathWithNamespace: string; webUrl: string }
interface Issue {
  iid: number; title: string; state: string; webUrl: string;
  labels: string[]; author: string; assignee: string | null;
  milestone: string | null; updatedAt: string; description: string;
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function useDebounced(value: string, ms: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Filesystem/wikilink-safe note title for "Create note". */
function noteTitleFor(issue: Issue): string {
  const clean = issue.title.replace(/[\\/:*?"<>|#^\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${issue.iid} ${clean}`.slice(0, 80).trim();
}

function noteContentFor(issue: Issue, project: Project): string {
  const labels = issue.labels.length
    ? `\nlabels: [${issue.labels.map((l) => `"${l.replace(/"/g, '')}"`).join(', ')}]`
    : '';
  return `---
gitlab: ${issue.webUrl}
project: ${project.pathWithNamespace}
issue: ${issue.iid}
state: ${issue.state}${labels}
---

# ${issue.title}

> GitLab issue [#${issue.iid}](${issue.webUrl}) in **${project.pathWithNamespace}** — opened by ${issue.author || 'unknown'}${issue.milestone ? `, milestone *${issue.milestone}*` : ''}

${issue.description || '*No description.*'}
`;
}

// ─── Shared style atoms ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 13,
  background: 'var(--bg-base)', border: '1px solid var(--border)',
  color: 'var(--text-primary)', outline: 'none',
};

const chipStyle: React.CSSProperties = {
  fontSize: 10.5, padding: '1px 7px', borderRadius: 999,
  background: 'rgba(127,119,221,0.12)', border: '1px solid rgba(127,119,221,0.25)',
  color: '#a49df0', whiteSpace: 'nowrap',
};

// ─── Connect card ─────────────────────────────────────────────────────────────

function ConnectCard({ onConnected }: { onConnected: () => void }) {
  const [host, setHost] = useState('https://gitlab.com');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setConnecting(true);
    setError('');
    try {
      const res = await fetch('/api/gitlab/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, token }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Connection failed'); return; }
      onConnected();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{
        width: '100%', maxWidth: 420, borderRadius: 14, padding: 28,
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
      }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
          Connect to GitLab
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 20 }}>
          Browse issues from your projects and turn them into notes. Create a
          personal access token with the <code style={{ color: '#a49df0' }}>read_api</code> scope
          under <em>GitLab → User settings → Access tokens</em>.
        </p>

        {error && (
          <div style={{
            marginBottom: 14, padding: '9px 12px', borderRadius: 8, fontSize: 12.5,
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={connect} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
              GitLab host
            </label>
            <input style={inputStyle} value={host} onChange={(e) => setHost(e.target.value)} placeholder="https://gitlab.com" />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5 }}>
              Personal access token
            </label>
            <input
              style={inputStyle} type="password" value={token}
              onChange={(e) => setToken(e.target.value)} placeholder="glpat-…" required
            />
          </div>
          <button
            type="submit" disabled={connecting || !token.trim()}
            style={{
              marginTop: 6, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'var(--accent)', color: '#fff', fontSize: 13.5, fontWeight: 500,
              opacity: connecting || !token.trim() ? 0.6 : 1,
            }}
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        </form>

        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.5 }}>
          The token is stored encrypted and only used server-side — your browser never talks to GitLab directly.
        </p>
      </div>
    </div>
  );
}

// ─── Project picker (dropdown with search) ────────────────────────────────────

function ProjectPicker({
  selected, onSelect,
}: { selected: Project | null; onSelect: (p: Project) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 300);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data } = useSWR<{ projects: Project[]; error?: string }>(
    `/api/gitlab/projects${debounced ? `?search=${encodeURIComponent(debounced)}` : ''}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  const projects = data?.projects ?? [];

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 220 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.pathWithNamespace : 'Select a project…'}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 60,
          background: '#1e2030', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden',
        }}>
          <div style={{ padding: 8 }}>
            <input
              autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              style={{ ...inputStyle, padding: '6px 10px', fontSize: 12.5 }}
            />
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', paddingBottom: 4 }}>
            {data === undefined ? (
              <p style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</p>
            ) : projects.length === 0 ? (
              <p style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>No projects found</p>
            ) : (
              projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p); setOpen(false); setSearch(''); }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '7px 14px',
                    background: selected?.id === p.id ? 'rgba(127,119,221,0.12)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = selected?.id === p.id ? 'rgba(127,119,221,0.12)' : 'transparent'; }}
                >
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--text-primary)' }}>{p.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>{p.pathWithNamespace}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Issue row ────────────────────────────────────────────────────────────────

function IssueRow({ issue, project }: { issue: Issue; project: Project }) {
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const tabsCtx = useTabsContext();
  const open = issue.state === 'opened';

  function copyMarkdown() {
    navigator.clipboard?.writeText(`[${issue.title} (#${issue.iid})](${issue.webUrl})`).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 900);
  }

  async function createNote() {
    if (creating) return;
    setCreating(true);
    try {
      const res = await fetch('/api/notes/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: noteTitleFor(issue),
          folder: 'GitLab',
          content: noteContentFor(issue, project),
        }),
      });
      const data = await res.json();
      if (!res.ok) return;
      globalMutate('/api/notes/tree');
      tabsCtx?.openTab(data.id, data.title, 'note');
      router.push(`/notes/${encodeURIComponent(String(data.id).replace(/\.md$/i, ''))}`);
    } finally {
      setCreating(false);
    }
  }

  const actionBtn: React.CSSProperties = {
    padding: '3px 9px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer',
    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
    color: 'var(--text-secondary)', whiteSpace: 'nowrap',
  };

  return (
    <div
      className="gitlab-issue-row"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* State badge */}
      <span
        title={open ? 'Open' : 'Closed'}
        style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: open ? '#4ade80' : '#a78bfa',
        }}
      />

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <a
            href={issue.webUrl} target="_blank" rel="noopener noreferrer"
            style={{
              fontSize: 13.5, color: 'var(--text-primary)', textDecoration: 'none',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#a49df0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          >
            {issue.title}
          </a>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', flexShrink: 0 }}>#{issue.iid}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
          {issue.labels.slice(0, 4).map((l) => <span key={l} style={chipStyle}>{l}</span>)}
          {issue.milestone && (
            <span style={{ ...chipStyle, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              ◈ {issue.milestone}
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {issue.assignee ? `${issue.assignee} · ` : ''}{relativeTime(issue.updatedAt)}
          </span>
        </div>
      </div>

      {/* Hover actions */}
      <div className="gitlab-issue-actions" style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button style={actionBtn} onClick={copyMarkdown}>{copied ? 'Copied ✓' : 'Copy link'}</button>
        <button style={{ ...actionBtn, color: '#a49df0', borderColor: 'rgba(127,119,221,0.35)' }} onClick={createNote}>
          {creating ? 'Creating…' : '+ Note'}
        </button>
      </div>
    </div>
  );
}

// ─── Issue browser ────────────────────────────────────────────────────────────

function IssueBrowser({
  status, onDisconnect,
}: { status: GitLabConfigStatus; onDisconnect: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<'opened' | 'closed' | 'all'>('opened');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search, 350);

  // Restore / persist the last-used project.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gitlab.project');
      if (saved) setProject(JSON.parse(saved));
    } catch {}
  }, []);
  function selectProject(p: Project) {
    setProject(p);
    try { localStorage.setItem('gitlab.project', JSON.stringify(p)); } catch {}
  }

  const issuesKey = project
    ? `/api/gitlab/issues?projectId=${project.id}&state=${state}${debounced ? `&search=${encodeURIComponent(debounced)}` : ''}`
    : null;
  const { data, isLoading } = useSWR<{ issues: Issue[]; error?: string }>(issuesKey, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });

  async function disconnect() {
    if (!window.confirm('Disconnect GitLab? Your token will be removed.')) return;
    await fetch('/api/gitlab/config', { method: 'DELETE' });
    try { localStorage.removeItem('gitlab.project'); } catch {}
    onDisconnect();
  }

  const pill = (value: 'opened' | 'closed' | 'all', label: string) => (
    <button
      key={value}
      onClick={() => setState(value)}
      style={{
        padding: '4px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
        background: state === value ? 'rgba(127,119,221,0.16)' : 'transparent',
        border: '1px solid ' + (state === value ? 'rgba(127,119,221,0.4)' : 'var(--border)'),
        color: state === value ? '#a49df0' : 'var(--text-secondary)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)', flexWrap: 'wrap', flexShrink: 0,
      }}>
        <ProjectPicker selected={project} onSelect={selectProject} />
        <div style={{ display: 'flex', gap: 6 }}>
          {pill('opened', 'Open')}{pill('closed', 'Closed')}{pill('all', 'All')}
        </div>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search issues…"
          style={{ ...inputStyle, width: 200, padding: '6px 11px', fontSize: 12.5 }}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{status.username}</span>
        <button
          onClick={disconnect}
          style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11.5, cursor: 'pointer',
            background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.4)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          Disconnect
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!project ? (
          <p style={{ padding: 32, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            Select a project to browse its issues.
          </p>
        ) : isLoading || data === undefined ? (
          <div>
            {[70, 45, 60, 35].map((w, i) => (
              <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ height: 11, width: `${w}%`, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />
              </div>
            ))}
          </div>
        ) : data.error ? (
          <p style={{ padding: 32, fontSize: 13, color: '#f87171', textAlign: 'center' }}>{data.error}</p>
        ) : data.issues.length === 0 ? (
          <p style={{ padding: 32, fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            No {state === 'all' ? '' : state === 'opened' ? 'open ' : 'closed '}issues
            {debounced ? ` matching “${debounced}”` : ''} in {project.name}.
          </p>
        ) : (
          <>
            {data.issues.map((issue) => (
              <IssueRow key={issue.iid} issue={issue} project={project} />
            ))}
            {data.issues.length === 50 && (
              <p style={{ padding: '12px 16px', fontSize: 11.5, color: 'var(--text-muted)' }}>
                Showing the 50 most recently updated issues — refine with search to find older ones.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GitLabPage() {
  const { data, mutate } = useSWR<GitLabConfigStatus>('/api/gitlab/config', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });

  return (
    <>
      {/* Row hover: reveal actions only when the pointer is on the row */}
      <style dangerouslySetInnerHTML={{ __html: `
        .gitlab-issue-row .gitlab-issue-actions { opacity: 0; transition: opacity 0.12s; }
        .gitlab-issue-row:hover .gitlab-issue-actions { opacity: 1; }
        .gitlab-issue-row:hover { background: rgba(255,255,255,0.02); }
      ` }} />
      {data === undefined ? (
        <div style={{ height: '100%', background: 'var(--bg-base)' }} />
      ) : data.connected ? (
        <IssueBrowser status={data} onDisconnect={() => mutate()} />
      ) : (
        <ConnectCard onConnected={() => mutate()} />
      )}
    </>
  );
}
