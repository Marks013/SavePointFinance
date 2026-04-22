import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { WhatsAppClient } from "@/features/whatsapp/components/whatsapp-client";

export default async function WhatsAppPage() {
  await requireEndUserDashboardPageUser();

  return <WhatsAppClient />;
}
