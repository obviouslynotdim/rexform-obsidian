const KETO_READ_URL = process.env.KETO_READ_URL || 'http://localhost:4466';
const KETO_WRITE_URL = process.env.KETO_WRITE_URL || 'http://localhost:4467';
const NAMESPACE = 'vault';

export type VaultRole = 'owner' | 'editor' | 'viewer';

export interface VaultMember {
  userId: string;
  role: VaultRole;
}

export interface UserVault {
  vaultId: string;
  role: VaultRole;
}

async function writeRelation(object: string, relation: string, subjectId: string): Promise<void> {
  const res = await fetch(`${KETO_WRITE_URL}/admin/relation-tuples`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ namespace: NAMESPACE, object, relation, subject_id: subjectId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keto write failed: ${res.status} ${text}`);
  }
}

async function deleteRelation(object: string, relation: string, subjectId: string): Promise<void> {
  const params = new URLSearchParams({
    namespace: NAMESPACE,
    object,
    relation,
    subject_id: subjectId,
  });
  const res = await fetch(`${KETO_WRITE_URL}/admin/relation-tuples?${params}`, {
    method: 'DELETE',
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Keto delete failed: ${res.status} ${text}`);
  }
}

export async function grantVaultAccess(vaultId: string, userId: string, role: VaultRole): Promise<void> {
  await writeRelation(vaultId, role, userId);
}

export async function revokeVaultAccess(vaultId: string, userId: string, role: VaultRole): Promise<void> {
  await deleteRelation(vaultId, role, userId);
}

export async function checkVaultAccess(vaultId: string, userId: string, role: VaultRole): Promise<boolean> {
  const params = new URLSearchParams({
    namespace: NAMESPACE,
    object: vaultId,
    relation: role,
    subject_id: userId,
  });
  try {
    const res = await fetch(`${KETO_READ_URL}/relation-tuples/check?${params}`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.allowed === true;
  } catch {
    return false;
  }
}

export async function getVaultMembers(vaultId: string): Promise<VaultMember[]> {
  const members: VaultMember[] = [];
  for (const role of ['owner', 'editor', 'viewer'] as VaultRole[]) {
    const params = new URLSearchParams({ namespace: NAMESPACE, object: vaultId, relation: role });
    try {
      // Use read API (4466) — consistent with getUserSharedVaults
      const res = await fetch(`${KETO_READ_URL}/relation-tuples?${params}`);
      if (!res.ok) {
        console.error(`[keto] getVaultMembers ${role}: ${res.status} ${await res.text().catch(() => '')}`);
        continue;
      }
      const data = await res.json();
      for (const tuple of (data.relation_tuples || [])) {
        if (tuple.subject_id) members.push({ userId: tuple.subject_id, role });
      }
    } catch (e) {
      console.error(`[keto] getVaultMembers ${role} error:`, e);
      continue;
    }
  }
  return members;
}

export async function getUserSharedVaults(userId: string): Promise<UserVault[]> {
  const vaults: UserVault[] = [];
  for (const role of ['owner', 'editor', 'viewer'] as VaultRole[]) {
    const params = new URLSearchParams({ namespace: NAMESPACE, relation: role, subject_id: userId });
    try {
      const res = await fetch(`${KETO_READ_URL}/relation-tuples?${params}`);
      if (!res.ok) continue;
      const data = await res.json();
      for (const tuple of data.relation_tuples || []) {
        if (tuple.object) vaults.push({ vaultId: tuple.object, role });
      }
    } catch {
      continue;
    }
  }
  return vaults;
}
