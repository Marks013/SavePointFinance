import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/layout/dashboard-shell";
import { getCurrentTenantAccess } from "@/lib/auth/session";

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
  } catch {
    redirect("/login");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
