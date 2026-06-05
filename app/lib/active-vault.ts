import { cookies } from 'next/headers';
import type { Session } from 'next-auth';
import { isAdminUser, getUserVaultName, getAdminVaultName } from './vault';

export interface VaultOption {
  name: string;
  label: string;
}

export function getAvailableVaults(session: Session | null): VaultOption[] {
  const userId = session?.user?.id;
  if (!userId) return [];
  if (isAdminUser(userId)) return [{ name: getAdminVaultName(), label: 'My Vault' }];
  return [{ name: getUserVaultName(userId), label: 'My Vault' }];
}

function canAccessVault(session: Session | null, vaultName: string): boolean {
  return getAvailableVaults(session).some((v) => v.name === vaultName);
}

export function getActiveVault(session: Session | null): string {
  const cookieStore = cookies();
  const override = cookieStore.get('rexform-active-vault')?.value;
  if (override && canAccessVault(session, override)) return override;
  const vaults = getAvailableVaults(session);
  return vaults[0]?.name ?? getAdminVaultName();
}
