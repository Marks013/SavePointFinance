import { redirect } from "next/navigation";

import { SharingClient } from "@/features/sharing/components/sharing-client";
import { requireSessionUser } from "@/lib/auth/session";
import { getSharingAuthority } from "@/lib/sharing/access";

export default async function SharingPage() {
  let canManage = false;

  try {
    const user = await requireSessionUser();
    const authority = await getSharingAuthority(user);
    canManage = authority.canManage;
  } catch {
    redirect("/dashboard");
  }

  if (!canManage) {
    redirect("/dashboard");
  }

  return <SharingClient />;
}
