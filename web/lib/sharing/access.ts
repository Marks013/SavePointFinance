import { prisma } from "@/lib/prisma/client";

type SharingSessionUser = {
  id: string;
  tenantId: string;
  role: "admin" | "member";
  isPlatformAdmin: boolean;
};

export async function getSharingAuthority(user: SharingSessionUser) {
  const primaryAdmin = await prisma.user.findFirst({
    where: {
      tenantId: user.tenantId,
      role: "admin",
      isPlatformAdmin: false
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true,
      name: true,
      email: true
    }
  });

  return {
    primaryAdmin,
    canManage: Boolean(primaryAdmin && primaryAdmin.id === user.id)
  };
}
