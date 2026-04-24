import type { ReactNode } from "react";
import { headers } from "next/headers";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentTenantAccess } from "@/lib/auth/session";
import { syncDueSubscriptionTransactions } from "@/lib/automation/subscriptions";
import { isAuthError } from "@/lib/observability/errors";
import { captureUnexpectedError } from "@/lib/observability/sentry";
import { sanitizeSearch } from "@/lib/security/sensitive-url";

type ProtectedLayoutProps = {
  children: ReactNode;
};

function isNextRedirectError(error: unknown) {
  return typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}

export default async function ProtectedLayout({ children }: ProtectedLayoutProps) {
  try {
    const requestHeaders = await headers();
    const pathname = requestHeaders.get("x-savepoint-pathname");
    const search = sanitizeSearch(requestHeaders.get("x-savepoint-search")) ?? "";
    const access = await getCurrentTenantAccess({
      allowBlocked: true
    });

    if (!access.license.canAccessApp) {
      redirect(`/license?reason=${access.blockedReason ?? "expired"}`);
    }

    if (access.isPlatformAdmin && pathname?.startsWith("/dashboard")) {
      if (pathname !== "/dashboard/admin" || new URLSearchParams(search).has("month")) {
        redirect("/dashboard/admin");
      }
    }

    if (!access.isPlatformAdmin && access.license.features.automation) {
      const syncContext = {
        tenantId: access.tenantId,
        userId: access.id,
        role: access.role,
        isPlatformAdmin: access.isPlatformAdmin
      };

      after(async () => {
        await syncDueSubscriptionTransactions({
          tenantId: syncContext.tenantId,
          userId: syncContext.userId
        }).catch((error) =>
          captureUnexpectedError(error, {
            surface: "layout",
            route: "/dashboard",
            operation: "sync",
            feature: "subscriptions",
            tenantId: syncContext.tenantId,
            userId: syncContext.userId,
            role: syncContext.role,
            isPlatformAdmin: syncContext.isPlatformAdmin
          })
        );
      });
    }
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    if (isAuthError(error)) {
      redirect("/login");
    }

    captureUnexpectedError(error, {
      surface: "layout",
      route: "/dashboard",
      operation: "access",
      feature: "protected-layout"
    });
    throw error;
  }

  return <DashboardShell>{children}</DashboardShell>;
}
