import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentTenantAccess } from "@/lib/auth/session";
import { syncDueSubscriptionTransactions } from "@/lib/automation/subscriptions";
import { isAuthError } from "@/lib/observability/errors";
import { captureUnexpectedError } from "@/lib/observability/sentry";

type ProtectedLayoutProps = {
  children: ReactNode;
};

export default async function ProtectedLayout({ children }: ProtectedLayoutProps) {
  try {
    const access = await getCurrentTenantAccess({
      allowBlocked: true
    });

    if (!access.license.canAccessApp) {
      redirect(`/license?reason=${access.blockedReason ?? "expired"}`);
    }

    // Lazy sync on login/access (only if automation feature is enabled)
    if (access.license.features.automation) {
      await syncDueSubscriptionTransactions({
        tenantId: access.tenantId,
        userId: access.id
      }).catch((error) =>
        captureUnexpectedError(error, {
          surface: "layout",
          route: "/dashboard",
          operation: "sync",
          feature: "subscriptions",
          tenantId: access.tenantId,
          userId: access.id,
          role: access.role,
          isPlatformAdmin: access.isPlatformAdmin
        })
      );
    }
  } catch (error) {
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
