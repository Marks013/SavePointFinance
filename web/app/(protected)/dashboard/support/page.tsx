import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { SupportClient } from "@/features/support/components/support-client";

export default async function SupportPage() {
  const user = await requireEndUserDashboardPageUser();

  return <SupportClient initialEmail={user.email ?? ""} initialName={user.name ?? ""} />;
}
