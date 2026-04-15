import type { LicenseFeature } from "@/lib/licensing/policy";
import { getCurrentTenantAccess } from "@/lib/licensing/server";

type RequireSessionUserOptions = {
  feature?: LicenseFeature;
};

export async function requireSessionUser(options: RequireSessionUserOptions = {}) {
  const access = await getCurrentTenantAccess({
    feature: options.feature
  });

  return {
    id: access.id,
    tenantId: access.tenantId,
    role: access.role,
    isPlatformAdmin: access.isPlatformAdmin,
    email: access.email,
    name: access.name,
    tenant: access.tenant,
    license: access.license
  };
}

export { getCurrentTenantAccess } from "@/lib/licensing/server";
