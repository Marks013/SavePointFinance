import { AdminSupportClient } from "@/features/admin-support/components/admin-support-client";
import { assertAdminAccess } from "@/lib/auth/admin";
import { requireProtectedPageAccess } from "@/lib/auth/session";

export default async function AdminSupportPage() {
  await requireProtectedPageAccess(async (user) => {
    assertAdminAccess(user);
    return true;
  });

  return <AdminSupportClient />;
}
