import { cookies } from 'next/headers';
import type { Session } from 'next-auth';
import { isAdminUser, getUserVaultName, getAdminVaultName } from './vault';

export interface VaultOption {
  name: string;
  label: string;
  role?: 'owner' | 'editor' | 'viewer';
}

export function getAvailableVaults(session: Session | null): VaultOption[] {
  const userId = session?.user?.id;
  if (!userId) return [];
  if (isAdminUser(userId)) return [{ name: getAdminVaultName(), label: 'My Vault', role: 'owner' }];
  return [{ name: getUserVaultName(userId), label: 'My Vault', role: 'owner' }];
}

function isPersonalVault(session: Session | null, vaultName: string): boolean {
  return getAvailableVaults(session).some((v) => v.name === vaultName);
}

async function isSharedVaultAccessible(userId: string, vaultName: string): Promise<boolean> {
  if (!vaultName.startsWith('vault-shared-')) return false;
  if (!process.env.KETO_READ_URL) return false;
  try {
    const { checkVaultAccess } = await import('./keto');
    return (
      (await checkVaultAccess(vaultName, userId, 'owner')) ||
      (await checkVaultAccess(vaultName, userId, 'editor')) ||
      (await checkVaultAccess(vaultName, userId, 'viewer'))
    );
  } catch {
    return false;
  }
}

export async function getActiveVault(session: Session | null): Promise<string> {
  const cookieStore = cookies();
  const override = cookieStore.get('rexform-active-vault')?.value;

  if (override) {
    if (isPersonalVault(session, override)) return override;
    const userId = session?.user?.id;
    if (userId && (await isSharedVaultAccessible(userId, override))) return override;
  }

  return getAvailableVaults(session)[0]?.name ?? getAdminVaultName();
}

/**
 * Resolves which vault to use for a note request.
 * Checks the optional ?vault query param first, then falls back to the active vault cookie.
 * Returns { db, canWrite } — canWrite is false for viewer-only shared vault access.
 */
export async function resolveVault(
  session: Session | null,
  vaultParam?: string | null
): Promise<{ db: string; canWrite: boolean }> {
  const userId = session?.user?.id;

  if (!vaultParam) {
    return { db: await getActiveVault(session), canWrite: true };
  }

  // Personal vault — always full access
  if (isPersonalVault(session, vaultParam)) {
    return { db: vaultParam, canWrite: true };
  }

  // Shared vault — check Keto
  if (userId && vaultParam.startsWith('vault-shared-') && process.env.KETO_READ_URL) {
    try {
      const { checkVaultAccess } = await import('./keto');
      const isOwner = await checkVaultAccess(vaultParam, userId, 'owner');
      const isEditor = !isOwner && (await checkVaultAccess(vaultParam, userId, 'editor'));
      const isViewer = !isOwner && !isEditor && (await checkVaultAccess(vaultParam, userId, 'viewer'));
      if (isOwner || isEditor || isViewer) {
        return { db: vaultParam, canWrite: isOwner || isEditor };
      }
    } catch (e) {
      console.error('[vault] Keto permission check failed:', e);
    }
  }

  // Access denied — fall back to active vault
  return { db: await getActiveVault(session), canWrite: true };
}
