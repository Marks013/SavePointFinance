import { redirect } from "next/navigation";

import { ProductAdminClient } from "@/features/catalog/components/product-admin-client";
import { assertAdminAccess } from "@/lib/auth/admin";
import { requireProtectedPageAccess } from "@/lib/auth/session";

type AdminProductsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminProductsPage({ searchParams }: AdminProductsPageProps) {
  const user = await requireProtectedPageAccess(async (currentUser) => {
    assertAdminAccess(currentUser);
    return true;
  });

  const params = await searchParams;

  if (user.isPlatformAdmin && params?.month) {
    redirect("/dashboard/admin/products");
  }

  return <ProductAdminClient />;
}
