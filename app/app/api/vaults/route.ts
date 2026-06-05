import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from '@/lib/auth';
import { getAvailableVaults, getActiveVault } from '@/lib/active-vault';

export async function GET() {
  const session = await getServerSession(authOptions);
  const vaults = getAvailableVaults(session);
  const activeVault = getActiveVault(session);
  return NextResponse.json({ vaults, activeVault });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let vault: string;
  try {
    ({ vault } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const available = getAvailableVaults(session);
  if (!available.some((v) => v.name === vault)) {
    return NextResponse.json({ error: 'Vault not accessible' }, { status: 403 });
  }

  cookies().set('rexform-active-vault', vault, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
  });

  return NextResponse.json({ activeVault: vault });
}
