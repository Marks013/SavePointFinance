import type { ReactNode } from "react";
import { after } from "next/server";
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

    if (access.license.features.automation) {
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
