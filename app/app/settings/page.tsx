'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface Credentials {
  username: string;
  password: string;
  serverUrl: string;
  database: string;
}

interface PluginState {
  kanban: boolean;
  calendar: boolean;
  gitlab: boolean;
}

const DEFAULT_PLUGINS: PluginState = { kanban: false, calendar: false, gitlab: false };

// ─── Small reusable pieces ───────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      className="px-2 py-1 rounded text-xs transition-colors hover:bg-white/5 flex-shrink-0"
      style={{ color: copied ? '#4ade80' : 'var(--text-muted)', border: '1px solid var(--border)' }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function CredentialRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [visible, setVisible] = useState(!secret);
  return (
    <div className="py-3 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      <div className="flex items-center gap-2">
        <code
          className="flex-1 px-3 py-1.5 rounded-lg text-sm font-mono truncate"
          style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        >
          {secret && !visible ? '••••••••••••••••' : value}
        </code>
        {secret && (
          <button
            onClick={() => setVisible((v) => !v)}
            className="px-2 py-1 rounded text-xs flex-shrink-0 hover:bg-white/5"
            style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            {visible ? 'Hide' : 'Show'}
          </button>
        )}
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function PluginToggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      aria-checked={enabled}
      role="switch"
      style={{
        width: 40,
        height: 22,
        borderRadius: 11,
        background: enabled ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 3,
          left: enabled ? 21 : 3,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.18s',
          display: 'block',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

function KanbanPluginIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="1.5" y="2.5" width="5" height="15" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="7.5" y="2.5" width="5" height="15" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="13.5" y="2.5" width="5" height="15" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2.5" y="4" width="3" height="2.2" rx="0.5" fill="currentColor" opacity="0.55" />
      <rect x="8.5" y="4" width="3" height="2.2" rx="0.5" fill="currentColor" opacity="0.55" />
      <rect x="8.5" y="8" width="3" height="2.2" rx="0.5" fill="currentColor" opacity="0.55" />
      <rect x="14.5" y="4" width="3" height="2.2" rx="0.5" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

function CalendarPluginIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="1.5" y="3.5" width="17" height="14.5" rx="1.8" stroke="currentColor" strokeWidth="1.3" />
      <line x1="1.5" y1="8.5" x2="18.5" y2="8.5" stroke="currentColor" strokeWidth="1.1" />
      <line x1="6" y1="1.5" x2="6" y2="5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="14" y1="1.5" x2="14" y2="5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6" cy="12.5" r="1.1" fill="currentColor" />
      <circle cx="10" cy="12.5" r="1.1" fill="currentColor" />
      <circle cx="14" cy="12.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

function GitLabPluginIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M10 17L2 10.5 4.5 3.5 7 10H13L15.5 3.5 18 10.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface PluginRowProps {
  icon: React.ReactNode;
  name: string;
  description: string;
  enabled: boolean;
  onToggle: () => void;
  saving: boolean;
}

function PluginRow({ icon, name, description, enabled, onToggle, saving }: PluginRowProps) {
  return (
    <div
      className="flex items-center gap-4 py-4 border-b last:border-0"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Icon */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: enabled ? 'rgba(127,119,221,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${enabled ? 'rgba(127,119,221,0.35)' : 'var(--border)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: enabled ? 'var(--accent)' : 'var(--text-muted)',
          transition: 'all 0.2s',
        }}
      >
        {icon}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {name}
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.04em',
              padding: '1px 7px',
              borderRadius: 99,
              background: enabled ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.07)',
              color: enabled ? '#4ade80' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}
          >
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {description}
        </p>
      </div>

      {/* Toggle */}
      <PluginToggle enabled={enabled} onChange={onToggle} disabled={saving} />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [creds, setCreds] = useState<Credentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState('');

  const [plugins, setPlugins] = useState<PluginState>(DEFAULT_PLUGINS);
  const [pluginSaving, setPluginSaving] = useState(false);

  const loadCreds = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/user/credentials');
      if (res.status === 400) {
        setError('Settings are not available for the admin account.');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to load credentials');
      }
      setCreds(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPlugins = useCallback(async () => {
    try {
      const res = await fetch('/api/user/plugins');
      if (res.ok) {
        const data = await res.json();
        setPlugins({ ...DEFAULT_PLUGINS, ...(data.plugins ?? {}) });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') { router.replace('/login'); return; }
    if (status === 'authenticated') {
      loadCreds();
      loadPlugins();
    }
  }, [status, loadCreds, loadPlugins, router]);

  const regenerate = async () => {
    if (!confirm('Regenerate password? Your current LiveSync connection will stop working until you update it in Obsidian.')) return;
    setRegenerating(true);
    try {
      const res = await fetch('/api/user/credentials', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to regenerate');
      setCreds(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegenerating(false);
    }
  };

  const repairConnection = async () => {
    setRepairing(true);
    setError('');
    try {
      const res = await fetch('/api/user/credentials', { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Repair failed');
      }
      setCreds(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRepairing(false);
    }
  };

  const togglePlugin = async (key: keyof PluginState) => {
    const original = { ...plugins };
    const updated = { ...plugins, [key]: !plugins[key] };
    setPlugins(updated);
    setPluginSaving(true);
    try {
      const res = await fetch('/api/user/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plugins: updated }),
      });
      if (!res.ok) setPlugins(original);
    } catch {
      setPlugins(original);
    } finally {
      setPluginSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-base)' }}>
        <div className="text-sm animate-pulse" style={{ color: 'var(--text-secondary)' }}>Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8" style={{ background: 'var(--bg-base)' }}>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Settings</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Account and sync configuration</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-800 bg-red-900/20">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Account section */}
        <Card className="p-6 mb-6">
          <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Account</h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Email</span>
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{session?.user?.email}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Role</span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
              >
                {session?.user?.isAdmin ? 'Admin' : 'Member'}
              </span>
            </div>
          </div>
        </Card>

        {/* LiveSync section */}
        {creds && (
          <Card className="p-6 mb-6">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                Connect Obsidian (LiveSync)
              </h2>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--text-secondary)' }}>
              Use these details in the{' '}
              <span className="font-medium" style={{ color: 'var(--accent)' }}>
                Self-hosted LiveSync
              </span>{' '}
              Obsidian plugin to sync your vault on desktop or mobile.
            </p>

            <div className="rounded-xl border overflow-hidden mb-4" style={{ borderColor: 'var(--border)' }}>
              <CredentialRow label="Server URL" value={creds.serverUrl} />
              <CredentialRow label="Database" value={creds.database} />
              <CredentialRow label="Username" value={creds.username} />
              <CredentialRow label="Password" value={creds.password} secret />
            </div>

            <div className="rounded-xl p-4 mb-4" style={{ background: 'var(--bg-base)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
                LiveSync plugin settings
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                In Obsidian → Self-hosted LiveSync → Remote Database Configuration, set:
                <br />• <strong>URI</strong>: the Server URL above
                <br />• <strong>Username / Password</strong>: as shown
                <br />• <strong>Database name</strong>: the Database value above
                <br />• Leave <strong>Passphrase</strong> empty unless you want end-to-end encryption
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                If Obsidian shows "access forbidden", click Repair to re-configure CouchDB access.
              </p>
              <div className="flex gap-2 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={repairing}
                  onClick={repairConnection}
                >
                  {repairing ? 'Repairing…' : 'Repair Connection'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={regenerating}
                  onClick={regenerate}
                >
                  Regenerate Password
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Community Plugins section */}
        <Card className="p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
              Community Plugins
            </h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Extend REXFORM Notes with additional views and integrations.
              Enabled plugins appear as icons in the sidebar.
            </p>
          </div>

          <PluginRow
            icon={<KanbanPluginIcon />}
            name="Kanban"
            description="Organize tasks with drag-and-drop boards"
            enabled={plugins.kanban}
            onToggle={() => togglePlugin('kanban')}
            saving={pluginSaving}
          />
          <PluginRow
            icon={<CalendarPluginIcon />}
            name="Calendar"
            description="Navigate and create daily notes by date"
            enabled={plugins.calendar}
            onToggle={() => togglePlugin('calendar')}
            saving={pluginSaving}
          />
          <PluginRow
            icon={<GitLabPluginIcon />}
            name="GitLab Work Items"
            description="Link notes to GitLab issues, epics and milestones"
            enabled={plugins.gitlab}
            onToggle={() => togglePlugin('gitlab')}
            saving={pluginSaving}
          />
        </Card>
      </div>
    </div>
  );
}
