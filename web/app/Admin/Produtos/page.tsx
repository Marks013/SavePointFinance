import { redirect } from "next/navigation";

export default function LegacyAdminProductsPage() {
  redirect("/dashboard/admin/products");
}
