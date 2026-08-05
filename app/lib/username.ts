import { kratosAdmin } from './kratos';
import { listSsoUsers } from './sso-users';

export const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

/**
 * Checks the username against both identity sources. Best-effort against
 * Kratos admin — unreachable (e.g. local dev, see findKratosByEmail) just
 * skips that half rather than failing the whole check.
 */
export async function isUsernameTaken(username: string, excludeUserId?: string): Promise<boolean> {
  const needle = username.toLowerCase();

  try {
    const { data } = await kratosAdmin.listIdentities({ perPage: 500 });
    if (
      data.some(
        (i) =>
          i.id !== excludeUserId &&
          String((i.metadata_public as any)?.username ?? '').toLowerCase() === needle
      )
    ) {
      return true;
    }
  } catch {
    // Kratos admin unreachable — fall through to the SSO registry only.
  }

  const ssoUsers = await listSsoUsers();
  return ssoUsers.some((u) => u.id !== excludeUserId && (u.username ?? '').toLowerCase() === needle);
}
