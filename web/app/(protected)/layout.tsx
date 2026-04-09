import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentTenantAccess } from "@/lib/auth/session";
import { syncDueSubscriptionTransactions } from "@/lib/automation/subscriptions";

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
      // We run this in background (not awaited to not block the UI) 
      // OR we await it if we want the data to be fresh for the first page.
      // Since it's fast if nothing is due, we can await it or use a background promise.
      // Awaiting is safer to avoid race conditions on the first dashboard load.
      await syncDueSubscriptionTransactions({
        tenantId: access.tenantId,
        userId: access.id
      }).catch(err => console.error("Lazy Sync Error:", err));
    }
  } catch {
    redirect("/login");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
