import { AdminClient } from "@/features/admin/components/admin-client";
import { assertAdminAccess } from "@/lib/auth/admin";
import { requireProtectedPageAccess } from "@/lib/auth/session";

export default async function AdminPage() {
  await requireProtectedPageAccess(async (user) => {
    assertAdminAccess(user);
    return true;
  });

  return <AdminClient />;
}
