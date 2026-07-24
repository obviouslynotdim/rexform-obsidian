'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { mutate as swrMutate } from 'swr';
import { useSession } from 'next-auth/react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { PLUGIN_REGISTRY, type PluginDefinition } from '@/lib/plugin-registry';
import { useI18n, type Locale } from '@/lib/i18n/context';
import { useSettingsModal } from '@/context/SettingsModalContext';
import WikiMarkdown from '@/components/WikiMarkdown';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Credentials {
  username: string;
  password: string;
  serverUrl: string;
  database: string;
}

interface PluginData {
  installed: string[];
  enabled: Record<string, boolean>;
}

const DEFAULT_PLUGIN_DATA: PluginData = { installed: [], enabled: {} };

type NewNoteLocation = 'root' | 'current';
interface FileSettings {
  syncHeadingWithFilename: boolean;
  newNoteLocation: NewNoteLocation;
}

const DEFAULT_FILE_SETTINGS: FileSettings = {
  syncHeadingWithFilename: true,
  newNoteLocation: 'root',
};

function normaliseFileSettings(input: any): FileSettings {
  const src = input && typeof input === 'object' ? input : {};
  return {
    syncHeadingWithFilename:
      typeof src.syncHeadingWithFilename === 'boolean'
        ? src.syncHeadingWithFilename
        : DEFAULT_FILE_SETTINGS.syncHeadingWithFilename,
    newNoteLocation: src.newNoteLocation === 'current' ? 'current' : 'root',
  };
}

// ─── Credential components ────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="px-2 py-1 rounded text-xs transition-colors hover:bg-white/5 flex-shrink-0"
      style={{ color: copied ? '#4ade80' : 'var(--text-muted)', border: '1px solid var(--border)' }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

// One credential as a compact single-line row: label · mono value · actions.
function CredentialRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [visible, setVisible] = useState(!secret);
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
      <span
        className="text-xs font-medium flex-shrink-0"
        style={{ color: 'var(--text-secondary)', width: 96 }}
      >
        {label}
      </span>
      <code
        className="flex-1 min-w-0 text-[12.5px] font-mono truncate"
        style={{ color: 'var(--text-primary)', background: 'transparent' }}
        title={secret && !visible ? undefined : value}
      >
        {secret && !visible ? '••••••••••••••••' : value}
      </code>
      {secret && (
        <button
          onClick={() => setVisible(v => !v)}
          className="px-2 py-0.5 rounded text-xs flex-shrink-0 hover:bg-white/5"
          style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      )}
      <CopyButton value={value} />
    </div>
  );
}

// ─── Plugin icon SVGs ─────────────────────────────────────────────────────────

function KanbanPluginIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
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

function CalendarPluginIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
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

function GitLabPluginIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M10 17L2 10.5 4.5 3.5 7 10H13L15.5 3.5 18 10.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LiveSyncPluginIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M16.5 10a6.5 6.5 0 0 1-11.1 4.6M3.5 10a6.5 6.5 0 0 1 11.1-4.6"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
      />
      <path d="M14.2 3.2v2.6h-2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.8 16.8v-2.6h2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PdfPluginIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M4 2.5h7.5L16 7v10a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 4 17V4a1.5 1.5 0 0 1 1.5-1.5Z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
      <path d="M11.5 2.5V7H16" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M6.5 11h7M6.5 14h4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function SpeechPluginIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="10" y1="15" x2="10" y2="18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="7.5" y1="18" x2="12.5" y2="18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function PluginIcon({ id, size = 20 }: { id: string; size?: number }) {
  switch (id) {
    case 'kanban':   return <KanbanPluginIcon size={size} />;
    case 'calendar': return <CalendarPluginIcon size={size} />;
    case 'gitlab':   return <GitLabPluginIcon size={size} />;
    case 'livesync': return <LiveSyncPluginIcon size={size} />;
    case 'pdf':      return <PdfPluginIcon size={size} />;
    case 'speech':   return <SpeechPluginIcon size={size} />;
    default:         return null;
  }
}

// ─── Small UI atoms ───────────────────────────────────────────────────────────

export function PluginToggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={enabled}
      style={{
        width: 40, height: 22, borderRadius: 11,
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
      <span style={{
        position: 'absolute', top: 3, left: enabled ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.18s', display: 'block',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </button>
  );
}

// Top-right install notice (Obsidian-style): spinner + "Installing plugin
// …" while the (simulated) install runs, with a progress bar sweeping left to
// right; flips to a ✓ "installed" state just before it disappears.
export const INSTALL_DELAY_MS = 1400;

function InstallToast({ name, done }: { name: string; done: boolean }) {
  return (
    <div
      style={{
        position: 'fixed', top: 70, right: 20, zIndex: 11000,
        width: 280,
        background: '#1e2030',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        {done ? (
          <svg width="15" height="15" viewBox="0 0 15 15" style={{ flexShrink: 0 }}>
            <circle cx="7.5" cy="7.5" r="6.5" fill="rgba(74,222,128,0.15)" stroke="#4ade80" strokeWidth="1.2" />
            <polyline points="4.5,7.8 6.7,10 10.5,5.5" stroke="#4ade80" strokeWidth="1.4"
              fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 15 15" className="animate-spin" style={{ flexShrink: 0 }}>
            <circle cx="7.5" cy="7.5" r="6" stroke="rgba(255,255,255,0.15)" strokeWidth="2" fill="none" />
            <path d="M13.5 7.5a6 6 0 0 0-6-6" stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinecap="round" />
          </svg>
        )}
        <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', minWidth: 0 }}>
          {done ? <>Plugin &ldquo;{name}&rdquo; installed</> : <>Installing plugin &ldquo;{name}&rdquo;…</>}
        </span>
      </div>
      {/* Progress track — fill animates left → right for the install duration */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)' }}>
        <div
          style={{
            height: '100%',
            background: done ? '#4ade80' : 'var(--accent)',
            width: done ? '100%' : undefined,
            animation: done ? undefined : `rf-progress ${INSTALL_DELAY_MS}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}

// × close button shared by the browse modal's grid header and detail header.
function CloseBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Close"
      style={{
        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'rgba(255,255,255,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, lineHeight: 1, padding: 0,
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
        (e.currentTarget as HTMLButtonElement).style.color = '#fff';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
      }}
    >
      ×
    </button>
  );
}

// Custom checkbox styled like the search fields (same fill + border) instead
// of the native browser control. Checked → accent fill with a check mark.
function FilterCheckbox({
  checked,
  onChange,
  label,
  style,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  style?: React.CSSProperties;
}) {
  return (
    <label
      style={{
        display: 'flex', alignItems: 'center', gap: 7,
        fontSize: 12, color: 'rgba(255,255,255,0.55)',
        cursor: 'pointer', userSelect: 'none', flexShrink: 0,
        ...style,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ display: 'none' }}
      />
      <span style={{
        width: 15, height: 15, borderRadius: 4, flexShrink: 0,
        background: checked ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${checked ? 'var(--accent)' : 'rgba(255,255,255,0.1)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background 0.15s, border-color 0.15s',
      }}>
        {checked && (
          <svg width="9" height="9" viewBox="0 0 9 9">
            <polyline
              points="1.5,4.5 3.5,6.5 7.5,2"
              stroke="#fff" strokeWidth="1.5" fill="none"
              strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {label}
    </label>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M7 1.5v1.2M7 11.3v1.2M1.5 7h1.2M11.3 7h1.2M3.1 3.1l.85.85M10.05 10.05l.85.85M10.9 3.1l-.85.85M3.95 10.05l-.85.85"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2 3.5h10M5.5 3.5V2.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M11 3.5l-.75 7a1 1 0 0 1-1 .9H4.75a1 1 0 0 1-1-.9L3 3.5"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBtn({
  onClick,
  title,
  children,
  danger,
}: {
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 28, height: 28, borderRadius: 6, border: 'none',
        background: hov ? (danger ? 'rgba(248,113,113,0.12)' : 'rgba(255,255,255,0.08)') : 'transparent',
        color: hov ? (danger ? '#f87171' : '#fff') : 'var(--text-muted)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {children}
    </button>
  );
}

// ─── Installed plugin row ─────────────────────────────────────────────────────

function InstalledPluginRow({
  plugin,
  enabled,
  saving,
  onToggle,
  onUninstall,
}: {
  plugin: PluginDefinition;
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
  onUninstall: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Icon box */}
      <div style={{
        width: 42, height: 42, borderRadius: 10, flexShrink: 0,
        background: enabled ? 'rgba(127,119,221,0.15)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${enabled ? 'rgba(127,119,221,0.35)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: enabled ? 'var(--accent)' : 'var(--text-muted)',
        transition: 'all 0.2s',
      }}>
        <PluginIcon id={plugin.id} size={20} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {plugin.name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            v{plugin.version} · {plugin.author}
          </span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          {plugin.description}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <IconBtn onClick={() => {}} title="Plugin settings (coming soon)">
          <GearIcon />
        </IconBtn>
        <IconBtn onClick={onUninstall} title="Uninstall" danger>
          <TrashIcon />
        </IconBtn>
        <div style={{ width: 8 }} />
        <PluginToggle enabled={enabled} onChange={onToggle} disabled={saving} />
      </div>
    </div>
  );
}

// ─── Plugin detail view (inside the browse modal) ─────────────────────────────

function PluginDetail({
  plugin,
  installed,
  enabled,
  installing,
  onInstall,
  onUninstall,
  onToggle,
}: {
  plugin: PluginDefinition;
  installed: boolean;
  enabled: boolean;
  installing: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onToggle: () => void;
}) {
  const primaryBtn: React.CSSProperties = {
    padding: '7px 18px',
    borderRadius: 6, border: 'none', cursor: 'pointer',
    fontSize: 12.5, fontWeight: 500,
    background: 'var(--accent)', color: '#fff',
    transition: 'background 0.15s',
  };
  const ghostBtn: React.CSSProperties = {
    padding: '7px 18px',
    borderRadius: 6, cursor: 'pointer',
    fontSize: 12.5, fontWeight: 500,
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.15)',
    color: 'rgba(255,255,255,0.55)',
    transition: 'color 0.15s, border-color 0.15s',
  };

  return (
    <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>
      {/* Identity row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 10, flexShrink: 0,
          background: installed && enabled ? 'rgba(127,119,221,0.15)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${installed && enabled ? 'rgba(127,119,221,0.35)' : 'rgba(255,255,255,0.1)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: installed ? 'var(--accent)' : 'rgba(255,255,255,0.5)',
        }}>
          <PluginIcon id={plugin.id} size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: '#fff' }}>{plugin.name}</span>
            {installed && (
              <span style={{
                fontSize: 9, fontWeight: 700,
                padding: '1px 6px', borderRadius: 99,
                background: 'rgba(127,119,221,0.25)',
                color: 'var(--accent)',
                letterSpacing: '0.05em',
                flexShrink: 0,
              }}>
                INSTALLED
              </span>
            )}
          </div>
          <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
            v{plugin.version} · by {plugin.author}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {!installed ? (
          <button
            onClick={onInstall}
            disabled={installing}
            style={{
              ...primaryBtn,
              opacity: installing ? 0.75 : 1,
              cursor: installing ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={e => { if (!installing) (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; }}
          >
            {installing && (
              <svg width="11" height="11" viewBox="0 0 15 15" className="animate-spin">
                <circle cx="7.5" cy="7.5" r="6" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" fill="none" />
                <path d="M13.5 7.5a6 6 0 0 0-6-6" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              </svg>
            )}
            {installing ? 'Installing…' : 'Install'}
          </button>
        ) : (
          <>
            <button
              onClick={onToggle}
              style={primaryBtn}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; }}
            >
              {enabled ? 'Disable' : 'Enable'}
            </button>
            <button
              onClick={onUninstall}
              style={ghostBtn}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.color = '#f87171';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(248,113,113,0.4)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.15)';
              }}
            >
              Uninstall
            </button>
          </>
        )}
      </div>

      {/* Rendered markdown "how to use" body */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
        <div className="prose prose-invert" style={{ fontSize: 13.5 }}>
          <WikiMarkdown>{plugin.longDescription}</WikiMarkdown>
        </div>
      </div>
    </div>
  );
}

// ─── Browse modal ─────────────────────────────────────────────────────────────

function BrowseModal({
  open,
  onClose,
  pluginData,
  installingId,
  onInstall,
  onUninstall,
  onToggle,
}: {
  open: boolean;
  onClose: () => void;
  pluginData: PluginData;
  installingId: string | null;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [installedOnly, setInstalledOnly] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSearch('');
      setInstalledOnly(false);
      setDetailId(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Esc steps back: detail → list, list → close. (The settings modal below
  // ignores Esc while this sub-modal is mounted.)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (detailId) setDetailId(null);
      else onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, detailId]);

  if (!open) return null;

  const installed = pluginData.installed;
  const detailPlugin = detailId ? PLUGIN_REGISTRY.find(p => p.id === detailId) ?? null : null;

  const filtered = PLUGIN_REGISTRY.filter(p =>
    (!installedOnly || installed.includes(p.id)) &&
    (!search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.author.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div
      data-submodal="browse-plugins"
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          // Same footprint as the settings panel underneath, so opening
          // Browse reads as a view swap rather than a smaller popup.
          width: 'min(1040px, calc(100vw - 48px))',
          height: 'min(720px, calc(100vh - 80px))',
          background: '#16213e',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header + search bar — grid view only. The detail view has no
            modal-wide header: the left pane starts with its own search and
            the ← / plugin name / × sit inside the right pane, aligned with
            the description. */}
        {!detailPlugin && (
          <>
            <div style={{
              padding: '18px 20px 14px',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <span style={{
                fontSize: 16, fontWeight: 600, color: '#fff',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                Browse plugins
              </span>
              <CloseBtn onClick={onClose} />
            </div>
            <div style={{
              padding: '12px 20px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <input
                ref={inputRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search plugins..."
                style={{
                  flex: 1, minWidth: 0, boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontSize: 13, color: '#fff', outline: 'none',
                }}
              />
              <FilterCheckbox
                checked={installedOnly}
                onChange={setInstalledOnly}
                label="Show installed only"
              />
            </div>
          </>
        )}

        {/* Detail view (Obsidian-style two-pane: list on the left, README on
            the right) or the full-width plugin grid */}
        {detailPlugin ? (
          <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            {/* Left pane — search + filter + plugin list */}
            <div
              style={{
                width: 250, flexShrink: 0,
                borderRight: '1px solid rgba(255,255,255,0.08)',
                display: 'flex', flexDirection: 'column', minHeight: 0,
              }}
            >
              <div style={{ padding: '12px 12px 6px', flexShrink: 0 }}>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search plugins..."
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '7px 10px',
                    fontSize: 12.5, color: '#fff', outline: 'none',
                    marginBottom: 8,
                  }}
                />
                <FilterCheckbox
                  checked={installedOnly}
                  onChange={setInstalledOnly}
                  label="Show installed only"
                  style={{ fontSize: 11.5, marginBottom: 6 }}
                />
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '0 0 4px' }}>
                  {filtered.length === PLUGIN_REGISTRY.length
                    ? `${PLUGIN_REGISTRY.length} plugins`
                    : `Showing ${filtered.length} of ${PLUGIN_REGISTRY.length} plugins`}
                </p>
              </div>
              <div style={{ overflowY: 'auto', flex: 1, padding: '0 8px 12px' }}>
                {filtered.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', padding: '8px 6px', margin: 0 }}>
                    No plugins match.
                  </p>
                ) : (
                  filtered.map(p => {
                    const active = p.id === detailPlugin.id;
                    const isInstalled = installed.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => setDetailId(p.id)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 9,
                          padding: '9px 10px', marginBottom: 6,
                          borderRadius: 8, cursor: 'pointer',
                          border: `1px solid ${active ? 'rgba(127,119,221,0.4)' : 'rgba(255,255,255,0.08)'}`,
                          background: active ? 'rgba(127,119,221,0.14)' : 'rgba(255,255,255,0.03)',
                          textAlign: 'left',
                          transition: 'background 0.12s, border-color 0.12s',
                        }}
                        onMouseEnter={e => {
                          if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
                        }}
                        onMouseLeave={e => {
                          if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)';
                        }}
                      >
                        <span style={{
                          width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                          background: 'rgba(255,255,255,0.06)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: isInstalled ? 'var(--accent)' : 'rgba(255,255,255,0.45)',
                        }}>
                          <PluginIcon id={p.id} size={14} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              flex: 1, minWidth: 0,
                              fontSize: 12.5, fontWeight: 600,
                              color: active ? '#fff' : 'rgba(255,255,255,0.85)',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {p.name}
                            </span>
                            {isInstalled && (
                              <span
                                title="Installed"
                                style={{
                                  width: 6, height: 6, borderRadius: '50%',
                                  background: 'var(--accent)', flexShrink: 0,
                                }}
                              />
                            )}
                          </span>
                          <span style={{
                            fontSize: 11, lineHeight: 1.45,
                            color: active ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.45)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>
                            {p.description}
                          </span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right pane — ← / name / × header aligned with the README below */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px 10px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                flexShrink: 0,
              }}>
                <button
                  onClick={() => setDetailId(null)}
                  title="Back to all plugins"
                  style={{
                    width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'rgba(255,255,255,0.55)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, lineHeight: 1, padding: 0,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#fff'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)'; }}
                >
                  ←
                </button>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: '#fff',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {detailPlugin.name}
                </span>
                <CloseBtn onClick={onClose} />
              </div>
              <PluginDetail
                plugin={detailPlugin}
                installed={installed.includes(detailPlugin.id)}
                enabled={!!pluginData.enabled[detailPlugin.id]}
                installing={installingId === detailPlugin.id}
                onInstall={() => onInstall(detailPlugin.id)}
                onUninstall={() => onUninstall(detailPlugin.id)}
                onToggle={() => onToggle(detailPlugin.id)}
              />
            </div>
          </div>
        ) : (
        <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>
          {filtered.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '40px 0',
              color: 'rgba(255,255,255,0.35)', fontSize: 13,
            }}>
              {installedOnly && !search.trim()
                ? 'No plugins installed yet.'
                : <>No plugins match &ldquo;{search}&rdquo;</>}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
              {filtered.map(plugin => {
                const isInstalled = installed.includes(plugin.id);
                return (
                  <div
                    key={plugin.id}
                    onClick={() => setDetailId(plugin.id)}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isInstalled ? 'rgba(127,119,221,0.25)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 10,
                      padding: 16,
                      display: 'flex', flexDirection: 'column', gap: 5,
                      cursor: 'pointer',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.07)';
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)';
                    }}
                  >
                    {/* Name + badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: 'rgba(255,255,255,0.06)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: isInstalled ? 'var(--accent)' : 'rgba(255,255,255,0.45)',
                      }}>
                        <PluginIcon id={plugin.id} size={16} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: '#fff' }}>
                            {plugin.name}
                          </span>
                          {isInstalled && (
                            <span style={{
                              fontSize: 9, fontWeight: 700,
                              padding: '1px 6px', borderRadius: 99,
                              background: 'rgba(127,119,221,0.25)',
                              color: 'var(--accent)',
                              letterSpacing: '0.05em',
                              flexShrink: 0,
                            }}>
                              INSTALLED
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                      by {plugin.author} · v{plugin.version}
                    </p>
                    <p style={{
                      fontSize: 12.5, color: 'rgba(255,255,255,0.6)',
                      lineHeight: 1.55, flex: 1, margin: '4px 0 10px',
                    }}>
                      {plugin.description}
                    </p>

                    <button
                      onClick={(e) => {
                        e.stopPropagation(); // don't also open the detail view
                        if (!isInstalled) onInstall(plugin.id);
                      }}
                      disabled={isInstalled || installingId === plugin.id}
                      style={{
                        padding: '7px 16px',
                        borderRadius: 6, border: 'none',
                        cursor: isInstalled || installingId === plugin.id ? 'default' : 'pointer',
                        fontSize: 12.5, fontWeight: 500,
                        background: isInstalled ? 'rgba(255,255,255,0.08)' : 'var(--accent)',
                        color: isInstalled ? 'rgba(255,255,255,0.4)' : '#fff',
                        opacity: installingId === plugin.id ? 0.75 : 1,
                        transition: 'background 0.15s',
                        alignSelf: 'flex-start',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      {installingId === plugin.id && (
                        <svg width="11" height="11" viewBox="0 0 15 15" className="animate-spin">
                          <circle cx="7.5" cy="7.5" r="6" stroke="rgba(255,255,255,0.3)" strokeWidth="2.5" fill="none" />
                          <path d="M13.5 7.5a6 6 0 0 0-6-6" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
                        </svg>
                      )}
                      {isInstalled ? 'Installed ✓' : installingId === plugin.id ? 'Installing…' : 'Install'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

// ─── Community plugins card ───────────────────────────────────────────────────

function CommunityPluginsCard({
  pluginData,
  saving,
  installingId,
  onInstall,
  onUninstall,
  onToggle,
}: {
  pluginData: PluginData;
  saving: boolean;
  installingId: string | null;
  onInstall: (id: string) => void;
  onUninstall: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [search, setSearch] = useState('');

  const installedCount = pluginData.installed.length;

  const installedPlugins = PLUGIN_REGISTRY.filter(p =>
    pluginData.installed.includes(p.id) &&
    (!search.trim() ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()))
  );

  const ghostBtn: React.CSSProperties = {
    padding: '5px 14px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: 12.5,
    cursor: 'default',
    flexShrink: 0,
  };

  return (
    <>
      <BrowseModal
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        pluginData={pluginData}
        installingId={installingId}
        onInstall={onInstall}
        onUninstall={onUninstall}
        onToggle={onToggle}
      />

      <Card className="p-6">
        <h2 className="text-base font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>
          Plugins
        </h2>

        {/* ── SECTION A ── */}

        {/* Row 1: Restricted mode */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          paddingBottom: 14, marginBottom: 14,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
              Restricted mode
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              When restricted mode is off, plugins can run custom code.
            </p>
          </div>
          <button style={ghostBtn}>Turn on and reload</button>
        </div>

        {/* Row 2: Community plugins / Browse */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          paddingBottom: 14, marginBottom: 14,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
              Plugins
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Browse and install plugins from the REXFORM library.
            </p>
          </div>
          <button
            onClick={() => setBrowseOpen(true)}
            style={{
              padding: '5px 14px',
              borderRadius: 6, border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 12.5, fontWeight: 500,
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent)'; }}
          >
            Browse
          </button>
        </div>

        {/* Row 3: Installed plugins count */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          paddingBottom: 18, marginBottom: 18,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
              Installed plugins
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {installedCount === 0
                ? 'No plugins installed yet.'
                : `You have ${installedCount} plugin${installedCount !== 1 ? 's' : ''} installed.`}
            </p>
          </div>
          <button style={ghostBtn}>Check for updates</button>
        </div>

        {/* ── SECTION B ── */}

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search installed plugins..."
          style={{
            width: '100%', boxSizing: 'border-box',
            background: 'var(--bg-base)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13, color: 'var(--text-primary)', outline: 'none',
            marginBottom: 4,
            transition: 'border-color 0.15s',
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'; }}
          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = 'var(--border)'; }}
        />

        {/* Installed list */}
        {pluginData.installed.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '32px 0',
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            No plugins installed yet.{' '}
            <button
              onClick={() => setBrowseOpen(true)}
              style={{
                background: 'none', border: 'none',
                color: 'var(--accent)', cursor: 'pointer',
                fontSize: 13, padding: 0, textDecoration: 'underline',
              }}
            >
              Click Browse to explore.
            </button>
          </div>
        ) : installedPlugins.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '24px 0',
            color: 'var(--text-muted)', fontSize: 13,
          }}>
            No installed plugins match &ldquo;{search}&rdquo;
          </div>
        ) : (
          <div>
            {installedPlugins.map((plugin, i) => (
              <div key={plugin.id} style={{ borderBottom: i === installedPlugins.length - 1 ? 'none' : undefined }}>
                <InstalledPluginRow
                  plugin={plugin}
                  enabled={!!pluginData.enabled[plugin.id]}
                  saving={saving}
                  onToggle={() => onToggle(plugin.id)}
                  onUninstall={() => onUninstall(plugin.id)}
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

// ─── Files & Links card ───────────────────────────────────────────────────────

function FilesLinksCard({
  settings,
  saving,
  onToggleSync,
  onChangeLocation,
}: {
  settings: FileSettings;
  saving: boolean;
  onToggleSync: () => void;
  onChangeLocation: (loc: NewNoteLocation) => void;
}) {
  return (
    <Card className="p-6 mt-6">
      <h2 className="text-base font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>
        Files &amp; Links
      </h2>

      {/* Row 1: Sync filename with heading */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        paddingBottom: 14, marginBottom: 14,
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
            Sync filename with heading
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            When enabled, editing the # heading renames the file and renaming the file
            updates the # heading — same as Obsidian.
          </p>
        </div>
        <PluginToggle enabled={settings.syncHeadingWithFilename} onChange={onToggleSync} disabled={saving} />
      </div>

      {/* Row 2: Default location for new notes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
            Default location for new notes
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Where new notes are created when clicking + New.
          </p>
        </div>
        <select
          value={settings.newNoteLocation}
          onChange={(e) => onChangeLocation(e.target.value as NewNoteLocation)}
          disabled={saving}
          style={{
            flexShrink: 0,
            padding: '6px 10px',
            borderRadius: 6,
            background: 'var(--bg-base)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            fontSize: 12.5,
            cursor: saving ? 'not-allowed' : 'pointer',
            outline: 'none',
          }}
        >
          <option value="root">Vault root</option>
          <option value="current">Same folder as current note</option>
        </select>
      </div>
    </Card>
  );
}

// ─── Settings modal ───────────────────────────────────────────────────────────
// Obsidian-style: a centered panel over a full-app scrim, left category nav,
// right content pane. Mounted once in the root layout; opened from anywhere
// via useSettingsModal(). Replaces the old /settings page (route now redirects).

export default function SettingsModal() {
  const modal = useSettingsModal();
  const open = modal?.open ?? false;
  const initialCategory = modal?.initialCategory ?? null;
  const closeSettings = modal?.closeSettings;

  const { data: session, status } = useSession();
  const { t, locale, setLocale } = useI18n();

  const [activeCategory, setActiveCategory] = useState('general');

  const [creds, setCreds] = useState<Credentials | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [error, setError] = useState('');

  const [pluginData, setPluginData] = useState<PluginData>(DEFAULT_PLUGIN_DATA);
  const [pluginSaving, setPluginSaving] = useState(false);
  // Install runs behind a short simulated delay (spinner in the button + the
  // top-right toast). The ref mirrors pluginData so the delayed commit reads
  // fresh state even if something else changed during the delay.
  const [installing, setInstalling] = useState<{ id: string; name: string; done: boolean } | null>(null);
  const pluginDataRef = useRef(pluginData);
  useEffect(() => { pluginDataRef.current = pluginData; }, [pluginData]);

  const [fileSettings, setFileSettings] = useState<FileSettings>(DEFAULT_FILE_SETTINGS);
  const [fileSettingsSaving, setFileSettingsSaving] = useState(false);

  // `silent` skips the full-page spinner — used when the modal is reopened
  // and already has data from a previous open (it stays mounted at the root,
  // so re-opening shouldn't flash "loading" over content the user already saw).
  const loadCreds = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
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
      if (!silent) setLoading(false);
    }
  }, []);

  const loadPlugins = useCallback(async () => {
    try {
      const res = await fetch('/api/user/plugins');
      if (res.ok) {
        const data = await res.json();
        setPluginData({
          installed: data.installed ?? [],
          enabled: data.enabled ?? {},
        });
      }
    } catch {}
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/user/settings');
      if (res.ok) setFileSettings(normaliseFileSettings(await res.json()));
    } catch {}
  }, []);

  // (Re)load data + honor the opener's requested category each time the modal
  // opens. No auth redirect here — the modal simply doesn't render while
  // unauthenticated (auth pages have no settings entry points anyway).
  // Only the first load (per mount) shows the full-page spinner — later
  // re-opens refresh silently since the modal stays mounted and already has
  // data on screen.
  const hasLoadedOnceRef = useRef(false);
  useEffect(() => {
    if (!open) return;
    setActiveCategory(initialCategory ?? 'general');
    if (status === 'authenticated') {
      const silent = hasLoadedOnceRef.current;
      hasLoadedOnceRef.current = true;
      loadCreds(silent);
      loadPlugins();
      loadSettings();
    }
  }, [open, initialCategory, status, loadCreds, loadPlugins, loadSettings]);

  // Esc closes the modal. Capture phase + stopPropagation so the note editor's
  // own document-level Escape handler (exit edit mode) doesn't also fire
  // underneath. Skipped while the Browse sub-modal is open — it closes itself.
  useEffect(() => {
    if (!open || !closeSettings) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-submodal]')) return;
      e.stopPropagation();
      closeSettings();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, closeSettings]);

  const saveFileSettings = useCallback(async (next: FileSettings, original: FileSettings) => {
    setFileSettingsSaving(true);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) setFileSettings(original);
    } catch {
      setFileSettings(original);
    } finally {
      setFileSettingsSaving(false);
    }
  }, []);

  // Same StrictMode rule as the plugin handlers below: saves happen outside
  // the setState updater.
  const handleToggleSync = useCallback(() => {
    const next: FileSettings = { ...fileSettings, syncHeadingWithFilename: !fileSettings.syncHeadingWithFilename };
    setFileSettings(next);
    saveFileSettings(next, fileSettings);
  }, [fileSettings, saveFileSettings]);

  const handleChangeLocation = useCallback((loc: NewNoteLocation) => {
    if (fileSettings.newNoteLocation === loc) return;
    const next: FileSettings = { ...fileSettings, newNoteLocation: loc };
    setFileSettings(next);
    saveFileSettings(next, fileSettings);
  }, [fileSettings, saveFileSettings]);

  const savePlugins = useCallback(async (next: PluginData, original: PluginData) => {
    setPluginSaving(true);
    try {
      const res = await fetch('/api/user/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installed: next.installed, enabled: next.enabled }),
      });
      if (!res.ok) {
        setPluginData(original);
      } else {
        // Push the saved state into the shared SWR cache so consumers outside
        // the modal (icon strip in NotesShell, sidebar context menu) update
        // immediately — their 30s dedupe would otherwise show stale state
        // until a refresh.
        swrMutate('/api/user/plugins', next, { revalidate: false });
      }
    } catch {
      setPluginData(original);
    } finally {
      setPluginSaving(false);
    }
  }, []);

  // NOTE: savePlugins must be called OUTSIDE the setState updater. React 18
  // StrictMode double-invokes updaters in dev, which fired two concurrent
  // POSTs — the second lost the CouchDB _rev race (409) and reverted the
  // toggle even though the first save persisted.
  const handleInstall = useCallback((id: string) => {
    if (pluginDataRef.current.installed.includes(id) || installing) return;
    const name = PLUGIN_REGISTRY.find(p => p.id === id)?.name ?? id;
    setInstalling({ id, name, done: false });
    // Simulated install: commit + persist after the delay, show the ✓ state
    // briefly, then drop the toast.
    setTimeout(() => {
      const original = pluginDataRef.current;
      if (!original.installed.includes(id)) {
        const next: PluginData = {
          installed: [...original.installed, id],
          enabled: { ...original.enabled, [id]: true },
        };
        setPluginData(next);
        savePlugins(next, original);
      }
      setInstalling({ id, name, done: true });
      setTimeout(() => setInstalling(null), 1100);
    }, INSTALL_DELAY_MS);
  }, [installing, savePlugins]);

  const handleUninstall = useCallback((id: string) => {
    const { [id]: _removed, ...restEnabled } = pluginData.enabled;
    const next: PluginData = {
      installed: pluginData.installed.filter(i => i !== id),
      enabled: restEnabled,
    };
    setPluginData(next);
    savePlugins(next, pluginData);
  }, [pluginData, savePlugins]);

  const handleToggle = useCallback((id: string) => {
    const next: PluginData = {
      ...pluginData,
      enabled: { ...pluginData.enabled, [id]: !pluginData.enabled[id] },
    };
    setPluginData(next);
    savePlugins(next, pluginData);
  }, [pluginData, savePlugins]);

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

  // The toast outlives the modal — closing settings mid-install keeps the
  // notice (and the delayed commit) running.
  const toast = installing
    ? <InstallToast name={installing.name} done={installing.done} />
    : null;

  if (!open || status === 'unauthenticated') return toast;

  const busy = status === 'loading' || loading;

  // Category list — Sync appears when the user has LiveSync credentials (admin
  // accounts have none) AND the Self-hosted LiveSync community plugin is
  // installed + enabled. 'general' is always present and is the default.
  const liveSyncOn =
    pluginData.installed.includes('livesync') && !!pluginData.enabled['livesync'];
  const categories: { id: string; label: string }[] = [
    { id: 'general', label: t('nav.general') },
    { id: 'account', label: t('nav.account') },
    { id: 'editor', label: t('nav.editor') },
    ...(creds && liveSyncOn ? [{ id: 'sync', label: t('nav.sync') }] : []),
    { id: 'plugins', label: t('nav.communityPlugins') },
  ];
  const selected = categories.some((c) => c.id === activeCategory) ? activeCategory : 'general';

  return (
    <>
    {toast}
    {/* Scrim — covers the whole app; click outside the panel closes. */}
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) closeSettings?.(); }}
    >
      <div
        style={{
          width: 'min(1040px, calc(100vw - 48px))',
          height: 'min(720px, calc(100vh - 80px))',
          background: '#16213e',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* × close — top-right of the panel (Obsidian-style) */}
        <button
          onClick={() => closeSettings?.()}
          title="Close"
          style={{
            position: 'absolute', top: 10, right: 12, zIndex: 2,
            width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, lineHeight: 1, padding: 0,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
            (e.currentTarget as HTMLButtonElement).style.color = '#fff';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
          }}
        >
          ×
        </button>

        {/* ── Category sidebar ── */}
        <nav
          style={{
            width: 200,
            flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            padding: '20px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflowY: 'auto',
          }}
        >
          <h1
            className="text-lg font-bold"
            style={{ color: 'var(--text-primary)', padding: '0 8px', marginBottom: 14 }}
          >
            {t('settings.title')}
          </h1>
          {categories.map((cat) => {
            const active = cat.id === selected;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  textAlign: 'left',
                  padding: '7px 10px',
                  borderRadius: 6,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13.5,
                  fontWeight: active ? 600 : 400,
                  background: active ? 'rgba(127,119,221,0.15)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </nav>

        {/* ── Content panel ── */}
        <div style={{ flex: 1, minWidth: 0, padding: 32, overflowY: 'auto' }}>
          {busy ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="text-sm animate-pulse" style={{ color: 'var(--text-secondary)' }}>
                {t('common.loading')}
              </div>
            </div>
          ) : (
          <>
          {error && (
            <div className="mb-6 p-4 rounded-xl border border-red-800 bg-red-900/20">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* General */}
          {selected === 'general' && (
            <Card className="p-6">
              <h2 className="text-base font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>
                {t('general.title')}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {t('general.language')}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('general.languageDesc')}
                  </p>
                </div>
                <select
                  value={locale}
                  onChange={(e) => setLocale(e.target.value as Locale)}
                  style={{
                    flexShrink: 0,
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    fontSize: 12.5,
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  <option value="en">{t('general.languageEnglish')}</option>
                  <option value="kh">{t('general.languageKhmer')}</option>
                </select>
              </div>
            </Card>
          )}

          {/* Account */}
          {selected === 'account' && (
            <Card className="p-6">
              <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>{t('account.title')}</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('account.email')}</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{session?.user?.email}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{t('account.role')}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'var(--accent)22', color: 'var(--accent)' }}
                  >
                    {session?.user?.isAdmin ? t('account.admin') : t('account.member')}
                  </span>
                </div>
              </div>
            </Card>
          )}

          {/* Editor (Files & Links) */}
          {selected === 'editor' && (
            <FilesLinksCard
              settings={fileSettings}
              saving={fileSettingsSaving}
              onToggleSync={handleToggleSync}
              onChangeLocation={handleChangeLocation}
            />
          )}

          {/* Sync (LiveSync) */}
          {selected === 'sync' && creds && (
            <Card className="p-6">
              {/* Header — icon + title + one-line subtitle */}
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 42, height: 42, borderRadius: 10,
                    background: 'rgba(127,119,221,0.15)',
                    border: '1px solid rgba(127,119,221,0.35)',
                    color: 'var(--accent)',
                  }}
                >
                  <LiveSyncPluginIcon size={20} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {t('sync.title')}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Sync this vault with the Obsidian app on desktop or mobile.
                  </p>
                </div>
              </div>

              {/* Credentials */}
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Database credentials
              </p>
              <div
                className="rounded-xl border px-4 mb-6"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-base)' }}
              >
                <CredentialRow label="Server URL" value={creds.serverUrl} />
                <CredentialRow label="Database" value={creds.database} />
                <CredentialRow label="Username" value={creds.username} />
                <CredentialRow label="Password" value={creds.password} secret />
              </div>

              {/* Setup steps */}
              <p
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: 'var(--text-secondary)' }}
              >
                Setup in Obsidian
              </p>
              <div className="mb-6">
                {[
                  <>Install the <span className="font-medium" style={{ color: 'var(--accent)' }}>Self-hosted LiveSync</span> community plugin.</>,
                  <>Open <strong>Remote Database Configuration</strong> and enter the URI (Server URL), username, password and database name above.</>,
                  <>Leave <strong>Passphrase</strong> empty unless you want end-to-end encryption.</>,
                ].map((step, i) => (
                  <div key={i} className="flex items-start gap-3 mb-2.5 last:mb-0">
                    <span
                      className="flex items-center justify-center flex-shrink-0 font-semibold"
                      style={{
                        width: 18, height: 18, borderRadius: '50%', fontSize: 10.5,
                        background: 'rgba(127,119,221,0.15)', color: 'var(--accent)',
                        marginTop: 1,
                      }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)', margin: 0 }}>
                      {step}
                    </p>
                  </div>
                ))}
              </div>

              {/* Troubleshooting */}
              <div
                className="flex items-center justify-between gap-3 flex-wrap border-t pt-4"
                style={{ borderColor: 'var(--border)' }}
              >
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Seeing &ldquo;access forbidden&rdquo; in Obsidian? Repair re-configures database access.
                </p>
                <div className="flex gap-2 flex-shrink-0">
                  <Button variant="ghost" size="sm" loading={repairing} onClick={repairConnection}>
                    {repairing ? t('sync.repairing') : t('sync.repair')}
                  </Button>
                  <Button variant="secondary" size="sm" loading={regenerating} onClick={regenerate}>
                    {t('sync.regenerate')}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Community Plugins */}
          {selected === 'plugins' && (
            <CommunityPluginsCard
              pluginData={pluginData}
              saving={pluginSaving}
              installingId={installing && !installing.done ? installing.id : null}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onToggle={handleToggle}
            />
          )}
          </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
