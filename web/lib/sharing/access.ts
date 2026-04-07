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

type SharingOwner = {
  id: string;
  name: string;
  email: string;
};

function toSharingOwner(user: SharingOwner) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

async function hasFamilySharingInvitation(invitationId: string) {
  const sharingAudit = await prisma.adminAuditLog.findFirst({
    where: {
      entityType: "invitation",
      entityId: invitationId,
      action: "sharing.invitation.created"
    },
    select: {
      id: true
    }
  });

  return Boolean(sharingAudit);
}

async function findCurrentUserAsAccountOwner(user: SharingSessionUser) {
  const currentUser = await prisma.user.findFirst({
    where: {
      id: user.id,
      tenantId: user.tenantId,
      isPlatformAdmin: false,
      isActive: true
    },
    select: {
      ...ownerSelect,
      role: true,
      email: true
    }
  });

  if (!currentUser) {
    return null;
  }

  if (currentUser.role === "admin") {
    return toSharingOwner(currentUser);
  }

  const acceptedInvitation = await prisma.invitation.findFirst({
    where: {
      tenantId: user.tenantId,
      email: {
        equals: currentUser.email,
        mode: "insensitive"
      },
      acceptedAt: {
        not: null
      }
    },
    orderBy: {
      acceptedAt: "desc"
    },
    select: {
      id: true,
      invitedBy: {
        select: {
          isPlatformAdmin: true
        }
      }
    }
  });

  if (acceptedInvitation && !acceptedInvitation.invitedBy?.isPlatformAdmin) {
    const isFamilyInvite = await hasFamilySharingInvitation(acceptedInvitation.id);

    if (isFamilyInvite) {
      return null;
    }
  }

  return toSharingOwner(currentUser);
}

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
  const currentUserOwner = await findCurrentUserAsAccountOwner(user);

  if (currentUserOwner) {
    return currentUserOwner;
  }

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
