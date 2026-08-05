import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';
import SessionProvider from '@/components/SessionProvider';
import SettingsModal from '@/components/settings/SettingsModal';
import { I18nProvider } from '@/lib/i18n/context';
import { SettingsModalProvider } from '@/context/SettingsModalContext';

export const metadata: Metadata = {
  title: 'REXFORM Notes',
  description: 'A powerful note-taking app by REXFORM',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <SessionProvider>
          <I18nProvider>
            <SettingsModalProvider>
              <SettingsModal />
              <AppShell>{children}</AppShell>
            </SettingsModalProvider>
          </I18nProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
