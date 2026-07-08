import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createPersonalVault, countPersonalVaults, MAX_PERSONAL_VAULTS } from '@/lib/vault';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let name: string;
  let template: 'blank' | 'starter';
  try {
    const body = await req.json();
    name = body.name;
    template = body.template === 'blank' ? 'blank' : 'starter';
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  name = name?.trim();
  if (!name) {
    return NextResponse.json({ error: 'Vault name is required' }, { status: 400 });
  }
  if (name.length > 60) {
    return NextResponse.json({ error: 'Vault name is too long (max 60 characters)' }, { status: 400 });
  }

  try {
    const count = await countPersonalVaults(session.user.id);
    if (count >= MAX_PERSONAL_VAULTS) {
      return NextResponse.json(
        { error: `Vault limit reached (${MAX_PERSONAL_VAULTS} extra vaults per account)` },
        { status: 403 }
      );
    }

    const { vaultId, vaultName } = await createPersonalVault(session.user.id, name, template);
    return NextResponse.json({ vaultId, vaultName }, { status: 201 });
  } catch (e: any) {
    console.error('[vaults/create] failed:', e);
    return NextResponse.json({ error: 'Failed to create vault' }, { status: 500 });
  }
}
