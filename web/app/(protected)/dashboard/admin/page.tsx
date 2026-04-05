import { redirect } from "next/navigation";

import { AdminClient } from "@/features/admin/components/admin-client";
import { requireAdminUser } from "@/lib/auth/admin";

export default async function AdminPage() {
  try {
    await requireAdminUser();
  } catch {
    redirect("/dashboard");
  }

  return <AdminClient />;
}
