import { NextResponse } from 'next/server';
import { createUserVault } from '@/lib/vault';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const identityId: string = body?.identity?.id ?? 'unknown';
    const email: string = body?.identity?.traits?.email ?? 'unknown';

    console.log('[kratos/after-register] identity.id:', identityId, 'email:', email);

    try {
      const { vaultName } = await createUserVault(identityId);
      console.log('[kratos/after-register] vault created:', vaultName);
      return NextResponse.json({ status: 'ok', vaultCreated: true, vaultName });
    } catch (vaultErr) {
      // Vault creation failure must not block registration — Kratos requires 200
      console.error('[kratos/after-register] vault creation failed (non-fatal):', vaultErr);
      return NextResponse.json({ status: 'ok', vaultCreated: false });
    }
  } catch (err) {
    console.error('[kratos/after-register] error:', err);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
