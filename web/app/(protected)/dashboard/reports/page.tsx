import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { ReportsClient } from "@/features/reports/components/reports-client";

export default async function ReportsPage() {
  await requireEndUserDashboardPageUser();

  return <ReportsClient />;
}
