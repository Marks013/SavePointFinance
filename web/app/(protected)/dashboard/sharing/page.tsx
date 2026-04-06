import { redirect } from "next/navigation";

import { SharingClient } from "@/features/sharing/components/sharing-client";
import { requireAdminUser } from "@/lib/auth/admin";

export default async function SharingPage() {
  try {
    await requireAdminUser();
  } catch {
    redirect("/dashboard");
  }

  return <SharingClient />;
}
