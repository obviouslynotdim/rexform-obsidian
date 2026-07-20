import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createSharedVault, deletePersonalVault, MAX_SHARED_VAULTS_OWNED } from '@/lib/vault';
import { getUserSharedVaults, checkVaultAccess } from '@/lib/keto';

// User-facing shared vault creation. Any authenticated user may create a
// shared vault and becomes its Keto owner (grant + _security sync happen
// inside createSharedVault). Admin management lives under /api/admin/vaults.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.KETO_WRITE_URL) {
    return NextResponse.json({ error: 'Shared vaults are not enabled' }, { status: 503 });
  }

  let name: string;
  try {
    ({ name } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  name = name?.trim();
  if (!name || name.length > 60) {
    return NextResponse.json({ error: 'Invalid vault name' }, { status: 400 });
  }

  const owned = (await getUserSharedVaults(session.user.id)).filter(
    (v) => v.role === 'owner' && v.vaultId.startsWith('vault-shared-')
  );
  if (owned.length >= MAX_SHARED_VAULTS_OWNED) {
    return NextResponse.json(
      { error: `Limit reached — you can own up to ${MAX_SHARED_VAULTS_OWNED} shared vaults` },
      { status: 400 }
    );
  }

  try {
    const { vaultId, vaultName } = await createSharedVault(name, session.user.id);

    // createSharedVault only WARNS when the Keto owner grant fails (e.g. Keto
    // unreachable from local dev — railway.internal URLs). Without the tuple
    // the vault is an invisible orphan, so verify and roll back instead.
    const ownerGranted = await checkVaultAccess(vaultId, session.user.id, 'owner');
    if (!ownerGranted) {
      await deletePersonalVault(vaultId).catch(() => {});
      return NextResponse.json(
        {
          error:
            'Permission service (Keto) is unreachable, so the vault could not be assigned to you. ' +
            'In local development the railway.internal Keto URLs only work on the deployed app.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ vaultId, vaultName }, { status: 201 });
  } catch (e: any) {
    console.error('[shared-vaults] create failed:', e);
    return NextResponse.json({ error: 'Failed to create shared vault' }, { status: 500 });
  }
}
