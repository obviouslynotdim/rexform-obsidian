import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { isAdminUser } from '@/lib/vault';
import { getVaultMembers, grantVaultAccess, type VaultRole } from '@/lib/keto';

const VALID_ROLES: VaultRole[] = ['owner', 'editor', 'viewer'];

export async function GET(_req: Request, { params }: { params: { vaultId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const members = await getVaultMembers(params.vaultId);
    return NextResponse.json({ members });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { vaultId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !isAdminUser(session.user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let userId: string, role: VaultRole;
  try {
    ({ userId, role } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!userId?.trim() || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: 'userId and valid role required' }, { status: 400 });
  }

  try {
    await grantVaultAccess(params.vaultId, userId, role);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
