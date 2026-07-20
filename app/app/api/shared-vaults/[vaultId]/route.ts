import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { renamePersonalVault, deletePersonalVault } from '@/lib/vault';
import { getUserVaultRole } from '@/lib/keto';

// renamePersonalVault / deletePersonalVault are generic under the hood
// (metadata-doc rename; Keto revoke + DB drop) — safe for shared vaults too.

async function requireOwner(vaultId: string): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!vaultId.startsWith('vault-shared-')) {
    return NextResponse.json({ error: 'Not a shared vault' }, { status: 400 });
  }
  const role = await getUserVaultRole(vaultId, session.user.id);
  if (role !== 'owner') {
    return NextResponse.json({ error: 'Only the vault owner can do this' }, { status: 403 });
  }
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: { vaultId: string } }) {
  const denied = await requireOwner(params.vaultId);
  if (denied) return denied;

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

  try {
    await renamePersonalVault(params.vaultId, name);
    return NextResponse.json({ vaultId: params.vaultId, vaultName: name });
  } catch (e: any) {
    console.error('[shared-vaults] rename failed:', e);
    return NextResponse.json({ error: 'Failed to rename vault' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { vaultId: string } }) {
  const denied = await requireOwner(params.vaultId);
  if (denied) return denied;

  try {
    await deletePersonalVault(params.vaultId);
  } catch (e: any) {
    console.error('[shared-vaults] delete failed:', e);
    return NextResponse.json({ error: 'Failed to delete vault' }, { status: 500 });
  }

  const cookieStore = cookies();
  if (cookieStore.get('rexform-active-vault')?.value === params.vaultId) {
    cookieStore.delete('rexform-active-vault');
  }
  return NextResponse.json({ success: true });
}
