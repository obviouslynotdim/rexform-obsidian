import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getVaultInvite, consumeVaultInvite, syncVaultSecurity } from '@/lib/vault';
import { getSharedVaultDisplayName } from '@/lib/couchdb';
import { getUserVaultRole, grantVaultAccess } from '@/lib/keto';

// Preview an invite without consuming it — any signed-in user holding the
// link can see what they'd be joining before accepting.
export async function GET(_req: NextRequest, { params }: { params: { vaultId: string; token: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!params.vaultId.startsWith('vault-shared-')) {
    return NextResponse.json({ error: 'Not a shared vault' }, { status: 400 });
  }

  const invite = await getVaultInvite(params.vaultId, params.token);
  if (!invite) {
    return NextResponse.json({ error: 'This invite link is invalid or has expired' }, { status: 410 });
  }

  const [vaultName, myRole] = await Promise.all([
    getSharedVaultDisplayName(params.vaultId),
    getUserVaultRole(params.vaultId, session.user.id),
  ]);
  return NextResponse.json({
    vaultName,
    role: invite.role,
    expiresAt: invite.expiresAt,
    alreadyMember: !!myRole,
  });
}

// Accept the invite: grants the role and consumes the (single-use) token.
export async function POST(_req: NextRequest, { params }: { params: { vaultId: string; token: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!params.vaultId.startsWith('vault-shared-')) {
    return NextResponse.json({ error: 'Not a shared vault' }, { status: 400 });
  }

  const invite = await getVaultInvite(params.vaultId, params.token);
  if (!invite) {
    return NextResponse.json({ error: 'This invite link is invalid or has expired' }, { status: 410 });
  }

  const existingRole = await getUserVaultRole(params.vaultId, session.user.id);
  if (existingRole) {
    // Already a member — consume the link anyway so it can't be reused, but
    // don't downgrade an existing (possibly higher) role.
    await consumeVaultInvite(params.vaultId, params.token);
    return NextResponse.json({ vaultId: params.vaultId, role: existingRole, alreadyMember: true });
  }

  try {
    await grantVaultAccess(params.vaultId, session.user.id, invite.role);
    await syncVaultSecurity(params.vaultId);
    await consumeVaultInvite(params.vaultId, params.token);
    const vaultName = await getSharedVaultDisplayName(params.vaultId);
    return NextResponse.json({ vaultId: params.vaultId, vaultName, role: invite.role });
  } catch (e: any) {
    console.error('[shared-vaults] invite-link accept failed:', e);
    return NextResponse.json({ error: 'Failed to join vault' }, { status: 500 });
  }
}
