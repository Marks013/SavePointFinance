import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { CardsClient } from "@/features/cards/components/cards-client";

export default async function CardsPage() {
  await requireEndUserDashboardPageUser();

  return <CardsClient />;
}
