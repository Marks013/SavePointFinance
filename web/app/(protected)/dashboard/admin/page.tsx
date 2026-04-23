import { AdminClient } from "@/features/admin/components/admin-client";
import { assertAdminAccess } from "@/lib/auth/admin";
import { requireProtectedPageAccess } from "@/lib/auth/session";
import { redirect } from "next/navigation";

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const user = await requireProtectedPageAccess(async (user) => {
    assertAdminAccess(user);
    return true;
  });

  const params = await searchParams;

  if (user.isPlatformAdmin && params?.month) {
    redirect("/dashboard/admin");
  }

  return <AdminClient isPlatformAdmin={user.isPlatformAdmin} />;
}
