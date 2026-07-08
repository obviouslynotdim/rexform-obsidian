'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import Card from '@/components/ui/Card';
import { PLUGIN_REGISTRY } from '@/lib/plugin-registry';
import { PluginIcon, PluginToggle } from '@/components/settings/SettingsModal';
import { useSettingsModal } from '@/context/SettingsModalContext';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface PluginData {
  installed: string[];
  enabled: Record<string, boolean>;
}

const DEFAULT_PLUGIN_DATA: PluginData = { installed: [], enabled: {} };

// Dashboard "Plugins" section — quick manage (enable/disable + install)
// backed by the same /api/user/plugins doc as the Settings modal. Writes go
// through the shared SWR key so the Settings modal, icon strip and sidebar
// pick the change up immediately.
export default function DashboardPlugins() {
  const { data: session } = useSession();
  const settingsModal = useSettingsModal();
  const { data, mutate } = useSWR('/api/user/plugins', fetcher, {
    dedupingInterval: 30_000,
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  // The plugins API is a no-op for the admin account — hide the section.
  if (session?.user?.isAdmin) return null;

  const pluginData: PluginData =
    data && Array.isArray(data.installed)
      ? { installed: data.installed, enabled: data.enabled ?? {} }
      : DEFAULT_PLUGIN_DATA;

  const save = async (next: PluginData, id: string) => {
    setBusyId(id);
    // Optimistic: swap the cache now, roll back via revalidate on failure.
    mutate(next, { revalidate: false });
    try {
      const res = await fetch('/api/user/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) mutate();
    } catch {
      mutate();
    } finally {
      setBusyId(null);
    }
  };

  const handleInstall = (id: string) => {
    if (pluginData.installed.includes(id)) return;
    save(
      {
        installed: [...pluginData.installed, id],
        enabled: { ...pluginData.enabled, [id]: true },
      },
      id
    );
  };

  const handleToggle = (id: string) => {
    save(
      {
        ...pluginData,
        enabled: { ...pluginData.enabled, [id]: !pluginData.enabled[id] },
      },
      id
    );
  };

  const enabledCount = pluginData.installed.filter((id) => pluginData.enabled[id]).length;

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Plugins
          </h2>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {pluginData.installed.length === 0
              ? 'None installed'
              : `${enabledCount} of ${pluginData.installed.length} installed enabled`}
          </span>
        </div>
        <button
          onClick={() => settingsModal?.openSettings('plugins')}
          className="text-sm hover:underline"
          style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          Manage in Settings →
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {PLUGIN_REGISTRY.map((plugin) => {
          const installed = pluginData.installed.includes(plugin.id);
          const enabled = installed && !!pluginData.enabled[plugin.id];
          const busy = busyId === plugin.id;
          return (
            <Card key={plugin.id} className="p-5">
              <div className="flex items-start gap-3">
                {/* Icon box */}
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: enabled ? 'rgba(127,119,221,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${enabled ? 'rgba(127,119,221,0.35)' : 'var(--border)'}`,
                    color: enabled ? 'var(--accent)' : 'var(--text-muted)',
                    transition: 'all 0.2s',
                  }}
                >
                  <PluginIcon id={plugin.id} size={19} />
                </div>

                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-semibold truncate mb-0.5"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {plugin.name}
                  </p>
                  <p
                    className="text-xs line-clamp-2"
                    style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}
                  >
                    {plugin.description}
                  </p>
                </div>

                {/* Action */}
                <div className="flex-shrink-0 pt-1">
                  {installed ? (
                    <PluginToggle enabled={enabled} onChange={() => handleToggle(plugin.id)} disabled={busy} />
                  ) : (
                    <button
                      onClick={() => handleInstall(plugin.id)}
                      disabled={busy}
                      className="text-xs font-medium px-3 py-1 rounded-md transition-opacity hover:opacity-90"
                      style={{
                        background: 'var(--accent)',
                        color: '#fff',
                        border: 'none',
                        cursor: busy ? 'default' : 'pointer',
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {busy ? 'Installing…' : 'Install'}
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
