import { auth } from "@/auth";
import { prisma } from "@/lib/prisma/client";
import {
  type LicenseFeature,
  getLicenseBlockedReason,
  resolveTenantLicenseState
} from "@/lib/licensing/policy";

type CurrentAccessOptions = {
  allowBlocked?: boolean;
  feature?: LicenseFeature;
};

export async function getCurrentTenantAccess(options: CurrentAccessOptions = {}) {
  const session = await auth();

  if (!session?.user?.id || !session.user.tenantId) {
    throw new Error("Unauthorized");
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      name: true,
      role: true,
      isPlatformAdmin: true,
      isActive: true,
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          maxUsers: true,
          isActive: true,
          trialDays: true,
          trialExpiresAt: true,
          expiresAt: true,
          planConfig: {
            select: {
              id: true,
              name: true,
              slug: true,
              tier: true,
              maxUsers: true,
              maxAccounts: true,
              maxCards: true,
              whatsappAssistant: true,
              automation: true,
              pdfExport: true,
              trialDays: true,
              isActive: true
            }
          }
        }
      }
    }
  });

  if (!user || !user.isActive || !user.tenant) {
    throw new Error("Unauthorized");
  }

  const resolvedLicense = resolveTenantLicenseState(user.tenant);
  const license = user.isPlatformAdmin
    ? {
        ...resolvedLicense,
        canAccessApp: true,
        isPremium: true,
        status: "premium" as const,
        statusLabel: "Superadmin da plataforma",
        effectiveLimits: {
          users: null,
          accounts: null,
          cards: null
        },
        features: {
          whatsappAssistant: true,
          automation: true,
          pdfExport: true
        }
      }
    : resolvedLicense;

  if (!options.allowBlocked && !license.canAccessApp) {
    throw new Error("Unauthorized");
  }

  if (!options.allowBlocked && options.feature && !license.features[options.feature]) {
    throw new Error("Unauthorized");
  }

  return {
    id: user.id,
    tenantId: user.tenantId,
    role: user.role,
    isPlatformAdmin: user.isPlatformAdmin,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    tenant: user.tenant,
    license,
    blockedReason: getLicenseBlockedReason(license)
  };
}

export async function getTenantSeatSummary(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: {
      id: tenantId
    },
    select: {
      id: true,
      name: true,
      slug: true,
      maxUsers: true,
      isActive: true,
      trialExpiresAt: true,
      expiresAt: true,
      planConfig: {
        select: {
          id: true,
          name: true,
          slug: true,
          tier: true,
          maxUsers: true,
          maxAccounts: true,
          maxCards: true,
          whatsappAssistant: true,
          automation: true,
          pdfExport: true,
          trialDays: true,
          isActive: true
        }
      }
    }
  });

  if (!tenant) {
    return null;
  }

  const [activeUsers, activeInvitations] = await Promise.all([
    prisma.user.count({
      where: {
        tenantId,
        isActive: true
      }
    }),
    prisma.invitation.count({
      where: {
        tenantId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      }
    })
  ]);

  const license = resolveTenantLicenseState(tenant);
  const userLimit = license.effectiveLimits.users;
  const remainingSeats = userLimit === null ? null : Math.max(0, userLimit - activeUsers - activeInvitations);

  return {
    tenant,
    license,
    activeUsers,
    activeInvitations,
    remainingSeats
  };
}

export async function canCreateAccount(tenantId: string, ownerUserId: string) {
  const owner = await prisma.user.findUnique({
    where: {
      id: ownerUserId
    },
    select: {
      isPlatformAdmin: true
    }
  });

  const tenant = await prisma.tenant.findUnique({
    where: {
      id: tenantId
    },
    select: {
      id: true,
      maxUsers: true,
      isActive: true,
      trialExpiresAt: true,
      expiresAt: true,
      planConfig: {
        select: {
          id: true,
          name: true,
          slug: true,
          tier: true,
          maxUsers: true,
          maxAccounts: true,
          maxCards: true,
          whatsappAssistant: true,
          automation: true,
          pdfExport: true,
          trialDays: true,
          isActive: true
        }
      }
    }
  });

  if (!tenant) {
    return null;
  }

  const license = resolveTenantLicenseState(tenant);
  const current = await prisma.financialAccount.count({
    where: {
      tenantId,
      isActive: true
    }
  });

  const limit = license.effectiveLimits.accounts;
  if (owner?.isPlatformAdmin) {
    return {
      license: {
        ...license,
        canAccessApp: true,
        effectiveLimits: {
          ...license.effectiveLimits,
          accounts: null
        }
      },
      current,
      limit: null,
      allowed: true
    };
  }

  return {
    license,
    current,
    limit,
    allowed: license.canAccessApp && (limit === null || current < limit)
  };
}

export async function canCreateCard(tenantId: string, ownerUserId: string) {
  const owner = await prisma.user.findUnique({
    where: {
      id: ownerUserId
    },
    select: {
      isPlatformAdmin: true
    }
  });

  const tenant = await prisma.tenant.findUnique({
    where: {
      id: tenantId
    },
    select: {
      id: true,
      maxUsers: true,
      isActive: true,
      trialExpiresAt: true,
      expiresAt: true,
      planConfig: {
        select: {
          id: true,
          name: true,
          slug: true,
          tier: true,
          maxUsers: true,
          maxAccounts: true,
          maxCards: true,
          whatsappAssistant: true,
          automation: true,
          pdfExport: true,
          trialDays: true,
          isActive: true
        }
      }
    }
  });

  if (!tenant) {
    return null;
  }

  const license = resolveTenantLicenseState(tenant);
  const current = await prisma.card.count({
    where: {
      tenantId,
      isActive: true
    }
  });

  const limit = license.effectiveLimits.cards;
  if (owner?.isPlatformAdmin) {
    return {
      license: {
        ...license,
        canAccessApp: true,
        effectiveLimits: {
          ...license.effectiveLimits,
          cards: null
        }
      },
      current,
      limit: null,
      allowed: true
    };
  }

  return {
    license,
    current,
    limit,
    allowed: license.canAccessApp && (limit === null || current < limit)
  };
}
