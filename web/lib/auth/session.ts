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
  redirectTo?: `/${string}`;
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
      redirect(redirectTo as Parameters<typeof redirect>[0]);
    }
  } catch (error) {
    if (isAuthError(error)) {
      redirect("/login");
    }

    if (isPermissionError(error)) {
      redirect(redirectTo as Parameters<typeof redirect>[0]);
    }

    throw error;
  }

  return user;
}

export async function requireEndUserDashboardPageUser(options: RequireSessionUserOptions = {}) {
  return requireProtectedPageAccess((user) => !user.isPlatformAdmin, {
    ...options,
    redirectTo: "/dashboard/admin"
  });
}

export { getCurrentTenantAccess } from "@/lib/licensing/server";
