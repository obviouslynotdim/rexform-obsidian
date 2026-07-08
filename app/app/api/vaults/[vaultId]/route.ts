import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import {
  getPersonalVaultPrefix,
  renamePersonalVault,
  deletePersonalVault,
} from '@/lib/vault';

function ownsPersonalVault(userId: string, vaultId: string): boolean {
  return vaultId.startsWith(getPersonalVaultPrefix(userId));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { vaultId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { vaultId } = params;
  if (!ownsPersonalVault(session.user.id, vaultId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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

  try {
    await renamePersonalVault(vaultId, name);
    return NextResponse.json({ vaultId, vaultName: name });
  } catch (e: any) {
    console.error('[vaults] rename failed:', e);
    return NextResponse.json({ error: 'Failed to rename vault' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { vaultId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { vaultId } = params;
  if (!ownsPersonalVault(session.user.id, vaultId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await deletePersonalVault(vaultId);
  } catch (e: any) {
    console.error('[vaults] delete failed:', e);
    return NextResponse.json({ error: 'Failed to delete vault' }, { status: 500 });
  }

  // If the deleted vault was active, fall back to the primary vault
  const cookieStore = cookies();
  if (cookieStore.get('rexform-active-vault')?.value === vaultId) {
    cookieStore.delete('rexform-active-vault');
  }

  return NextResponse.json({ success: true });
}
