import { NextRequest, NextResponse } from 'next/server';
import { kratosFrontend } from '@/lib/kratos';

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type') ?? 'login';
  try {
    if (type === 'registration') {
      const flow = await kratosFrontend.createNativeRegistrationFlow();
      return NextResponse.json({ id: flow.data.id });
    } else {
      const flow = await kratosFrontend.createNativeLoginFlow();
      return NextResponse.json({ id: flow.data.id });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
