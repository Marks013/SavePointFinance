import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { AccountsClient } from "@/features/accounts/components/accounts-client";

export default async function AccountsPage() {
  await requireEndUserDashboardPageUser();

  return <AccountsClient />;
}
