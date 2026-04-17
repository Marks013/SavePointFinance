import { SharingClient } from "@/features/sharing/components/sharing-client";
import { requireProtectedPageAccess } from "@/lib/auth/session";
import { getSharingAuthority } from "@/lib/sharing/access";

export default async function SharingPage() {
  await requireProtectedPageAccess(async (user) => {
    const authority = await getSharingAuthority(user);
    return authority.canManage;
  });

  return <SharingClient />;
}
