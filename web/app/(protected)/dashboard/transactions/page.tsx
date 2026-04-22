import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { TransactionsClient } from "@/features/transactions/components/transactions-client";

export default async function TransactionsPage() {
  await requireEndUserDashboardPageUser();

  return <TransactionsClient />;
}
