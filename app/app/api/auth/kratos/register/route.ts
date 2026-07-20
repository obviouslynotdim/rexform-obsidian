import { NextRequest, NextResponse } from 'next/server';
import { kratosFrontend } from '@/lib/kratos';
import { findSsoByEmail } from '@/lib/user-lookup';

export async function POST(req: NextRequest) {
  try {
    const { flowId, email, password, firstName, lastName } = await req.json();

    // Kratos's own email-uniqueness constraint only sees its own identity
    // store — it has no visibility into the separate rexform-sso-users
    // registry, so someone who already signed in via central SSO could
    // otherwise register a second, disconnected local account with the same
    // email. Block that here and point them at SSO instead.
    if (email) {
      const existingSso = await findSsoByEmail(String(email).toLowerCase());
      if (existingSso) {
        return NextResponse.json(
          {
            error: {
              message:
                'This email already has an account via REXFORM SSO — use "Sign in with REXFORM SSO" instead.',
            },
          },
          { status: 409 }
        );
      }
    }

    const result = await kratosFrontend.updateRegistrationFlow({
      flow: flowId,
      updateRegistrationFlowBody: {
        method: 'password',
        password,
        traits: { email, name: { first: firstName, last: lastName } },
      },
    });
    return NextResponse.json(result.data);
  } catch (err: any) {
    const status = err?.response?.status ?? 500;
    const data = err?.response?.data ?? { error: { message: err.message } };
    return NextResponse.json(data, { status });
  }
}
