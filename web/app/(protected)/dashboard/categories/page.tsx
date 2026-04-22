import { requireEndUserDashboardPageUser } from "@/lib/auth/session";
import { CategoriesClient } from "@/features/categories/components/categories-client";

export default async function CategoriesPage() {
  await requireEndUserDashboardPageUser();

  return <CategoriesClient />;
}
