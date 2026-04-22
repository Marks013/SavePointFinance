import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { SubscriptionsClient } from "@/features/subscriptions/components/subscriptions-client";

export default async function SubscriptionsPage() {
  await requireEndUserDashboardPageUser();

  return <SubscriptionsClient />;
}
