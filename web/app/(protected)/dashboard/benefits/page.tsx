import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { BenefitFoodClient } from "@/features/benefits/components/benefit-food-client";

export default async function BenefitsPage() {
  await requireEndUserDashboardPageUser();

  return <BenefitFoodClient />;
}
