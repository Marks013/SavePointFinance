import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { GoalsClient } from "@/features/goals/components/goals-client";

export default async function GoalsPage() {
  await requireEndUserDashboardPageUser();

  return <GoalsClient />;
}
