import type { Tenant, TenantWebmailConfig } from "../types";

/**
 * Resolves which mailbox a send/check action should use, now that a
 * workspace can have more than one connected. Precedence: the mailbox with
 * the given id (if it still exists) -> the tenant's default mailbox -> the
 * first mailbox on file -> undefined (no mailbox connected yet).
 */
export function getMailboxById(
  tenant: Tenant | null | undefined,
  id?: string | null
): TenantWebmailConfig | undefined {
  const list = tenant?.webmailConfigs;
  if (!list || list.length === 0) return undefined;
  if (id) {
    const found = list.find((m) => m.id === id);
    if (found) return found;
  }
  return list.find((m) => m.isDefault) || list[0];
}

export function getDefaultMailbox(tenant: Tenant | null | undefined): TenantWebmailConfig | undefined {
  return getMailboxById(tenant, undefined);
}

export function mailboxLabel(m?: TenantWebmailConfig | null): string {
  if (!m) return "";
  return m.label?.trim() || m.email || "Unnamed mailbox";
}
