'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useSettingsModal } from '@/context/SettingsModalContext';

// Settings is a modal overlay now (Obsidian-style) — see
// components/settings/SettingsModal.tsx. This route survives only so old
// links/bookmarks keep working: it opens the modal over /notes. Auth-gated so
// a logged-out visit doesn't leave the modal queued to pop after login.
export default function SettingsRedirect() {
  const openSettings = useSettingsModal()?.openSettings;
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'authenticated') {
      openSettings?.();
      router.replace('/notes');
    } else {
      router.replace('/login');
    }
  }, [status, openSettings, router]);

  return null;
}
