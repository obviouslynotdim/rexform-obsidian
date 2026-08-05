import { NextRequest, NextResponse } from 'next/server';
import { kratosFrontend, kratosAdmin } from '@/lib/kratos';
import { findSsoByEmail } from '@/lib/user-lookup';
import { USERNAME_RE, isUsernameTaken } from '@/lib/username';

export async function POST(req: NextRequest) {
  try {
    const { flowId, email, password, firstName, lastName, username } = await req.json();
    const trimmedUsername: string = typeof username === 'string' ? username.trim() : '';

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

    if (trimmedUsername) {
      if (!USERNAME_RE.test(trimmedUsername)) {
        return NextResponse.json(
          {
            error: {
              message: 'Username must be 3-32 characters: letters, numbers, dots, underscores or hyphens.',
            },
          },
          { status: 400 }
        );
      }
      if (await isUsernameTaken(trimmedUsername)) {
        return NextResponse.json(
          { error: { message: 'That username is already taken.' } },
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

    // metadata_public isn't settable via the self-service flow (traits only),
    // so it needs a follow-up admin call. Best-effort: Kratos admin is
    // unreachable in local dev (railway.internal), and the username can
    // always be set later from Profile settings — registration itself must
    // not fail because of this.
    if (trimmedUsername) {
      const created = (result.data as any).identity;
      if (created?.id) {
        try {
          await kratosAdmin.updateIdentity({
            id: created.id,
            updateIdentityBody: {
              schema_id: created.schema_id,
              state: created.state,
              traits: created.traits,
              metadata_public: { username: trimmedUsername },
            },
          });
        } catch (e) {
          console.error('[register] failed to set username at registration:', e);
        }
      }
    }

    return NextResponse.json(result.data);
  } catch (err: any) {
    const status = err?.response?.status ?? 500;
    const data = err?.response?.data ?? { error: { message: err.message } };
    return NextResponse.json(data, { status });
  }
}
