import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { InstallmentsClient } from "@/features/installments/components/installments-client";

export default async function InstallmentsPage() {
  await requireEndUserDashboardPageUser();

  return <InstallmentsClient />;
}
