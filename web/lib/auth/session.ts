import { redirect } from "next/navigation";

import type { LicenseFeature } from "@/lib/licensing/policy";
import { isAuthError, isPermissionError } from "@/lib/observability/errors";
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

export async function requireProtectedPageUser(options: RequireSessionUserOptions = {}) {
  try {
    return await requireSessionUser(options);
  } catch (error) {
    if (isAuthError(error)) {
      redirect("/login");
    }

    throw error;
  }
}

type ProtectedPageAccessOptions = RequireSessionUserOptions & {
  redirectTo?: "/dashboard";
};

type ProtectedPageUser = Awaited<ReturnType<typeof requireSessionUser>>;

export async function requireProtectedPageAccess(
  canAccess: (user: ProtectedPageUser) => boolean | Promise<boolean>,
  options: ProtectedPageAccessOptions = {}
) {
  const { redirectTo = "/dashboard", ...sessionOptions } = options;
  const user = await requireProtectedPageUser(sessionOptions);

  try {
    const allowed = await canAccess(user);

    if (!allowed) {
      redirect(redirectTo);
    }
  } catch (error) {
    if (isAuthError(error)) {
      redirect("/login");
    }

    if (isPermissionError(error)) {
      redirect(redirectTo);
    }

    throw error;
  }

  return user;
}

export { getCurrentTenantAccess } from "@/lib/licensing/server";
