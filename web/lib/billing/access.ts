import { PermissionError } from "@/lib/observability/errors";
import { getCurrentTenantAccess } from "@/lib/auth/session";
import { getSharingAuthority } from "@/lib/sharing/access";

export async function getBillingSessionAccess(options: { requireManager?: boolean } = {}) {
  const access = await getCurrentTenantAccess({
    allowBlocked: true
  });
  const sharingAuthority = await getSharingAuthority({
    id: access.id,
    tenantId: access.tenantId,
    role: access.role,
    isPlatformAdmin: access.isPlatformAdmin
  });
  const canManageBilling = access.isPlatformAdmin || sharingAuthority.canManage;

  if (options.requireManager && !canManageBilling) {
    throw new PermissionError("Forbidden");
  }

  return {
    ...access,
    canManageBilling
  };
}
