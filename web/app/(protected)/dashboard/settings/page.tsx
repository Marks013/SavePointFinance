import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { SettingsClient } from "@/features/settings/components/settings-client";

export default async function SettingsPage() {
  await requireEndUserDashboardPageUser();

  return <SettingsClient />;
}
