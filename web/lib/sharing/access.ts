import { prisma } from "@/lib/prisma/client";

type SharingSessionUser = {
  id: string;
  tenantId: string;
  role: "admin" | "member";
  isPlatformAdmin: boolean;
};

const ownerSelect = {
  id: true,
  name: true,
  email: true
};

async function findPlatformInvitedOwner(user: SharingSessionUser) {
  const platformInvitation = await prisma.invitation.findFirst({
    where: {
      tenantId: user.tenantId,
      acceptedAt: {
        not: null
      },
      invitedBy: {
        isPlatformAdmin: true
      }
    },
    orderBy: {
      acceptedAt: "asc"
    },
    select: {
      email: true
    }
  });

  if (!platformInvitation) {
    return null;
  }

  return prisma.user.findFirst({
    where: {
      tenantId: user.tenantId,
      email: {
        equals: platformInvitation.email,
        mode: "insensitive"
      },
      isPlatformAdmin: false,
      isActive: true
    },
    select: ownerSelect
  });
}

async function findSharingOwner(user: SharingSessionUser) {
  const primaryAdmin = await prisma.user.findFirst({
    where: {
      tenantId: user.tenantId,
      role: "admin",
      isPlatformAdmin: false,
      isActive: true
    },
    orderBy: {
      createdAt: "asc"
    },
    select: ownerSelect
  });

  if (primaryAdmin) {
    return primaryAdmin;
  }

  const platformInvitedOwner = await findPlatformInvitedOwner(user);

  if (platformInvitedOwner) {
    return platformInvitedOwner;
  }

  return prisma.user.findFirst({
    where: {
      tenantId: user.tenantId,
      isPlatformAdmin: false,
      isActive: true
    },
    orderBy: {
      createdAt: "asc"
    },
    select: ownerSelect
  });
}

export async function getSharingAuthority(user: SharingSessionUser) {
  const primaryAdmin = await findSharingOwner(user);

  return {
    primaryAdmin,
    canManage: Boolean(primaryAdmin && primaryAdmin.id === user.id)
  };
}
