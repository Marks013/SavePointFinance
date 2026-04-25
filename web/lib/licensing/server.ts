import * as Sentry from "@sentry/nextjs";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma/client";
import { AuthError } from "@/lib/observability/errors";
import { syncSentryAccessScope } from "@/lib/observability/sentry";
import { getFallbackFreePlan } from "@/lib/billing/plans";
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
    throw new AuthError();
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
    throw new AuthError();
  }

  let tenantForLicense = user.tenant;
  const now = new Date();
  const shouldCheckCanceledSubscriptionDowngrade =
    !user.isPlatformAdmin &&
    user.tenant.planConfig.tier === "pro" &&
    Boolean(user.tenant.expiresAt && user.tenant.expiresAt <= now);

  if (shouldCheckCanceledSubscriptionDowngrade) {
    const canceledSubscription = await prisma.billingSubscription.findFirst({
      where: {
        tenantId: user.tenantId,
        status: "canceled",
        nextBillingAt: {
          lte: now
        }
      },
      orderBy: [{ canceledAt: "desc" }, { createdAt: "desc" }]
    });

    if (canceledSubscription) {
      const freePlan = await getFallbackFreePlan();

      if (freePlan) {
        await prisma.tenant.update({
          where: {
            id: user.tenantId
          },
          data: {
            planId: freePlan.id,
            trialStart: null,
            trialDays: 0,
            trialExpiresAt: null,
            expiresAt: null,
            isActive: true
          }
        });

        tenantForLicense = {
          ...user.tenant,
          trialDays: 0,
          trialExpiresAt: null,
          expiresAt: null,
          planConfig: freePlan
        };
      }
    }
  }

  const resolvedLicense = resolveTenantLicenseState(tenantForLicense);
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
    throw new AuthError();
  }

  if (!options.allowBlocked && options.feature && !license.features[options.feature]) {
    throw new AuthError();
  }

  syncSentryAccessScope({
    id: user.id,
    tenantId: user.tenantId,
    role: user.role,
    isPlatformAdmin: user.isPlatformAdmin,
    plan: license.plan,
    licenseStatus: license.status
  });
  Sentry.setContext("tenant", {
    id: user.tenant.id,
    slug: user.tenant.slug,
    planSlug: tenantForLicense.planConfig?.slug ?? null
  });

  return {
    id: user.id,
    tenantId: user.tenantId,
    role: user.role,
    isPlatformAdmin: user.isPlatformAdmin,
    email: user.email,
    name: user.name,
    isActive: user.isActive,
    tenant: tenantForLicense,
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
      isActive: true,
      trialExpiresAt: true,
      expiresAt: true,
      planConfig: {
        select: {
          id: true,
          name: true,
          slug: true,
          tier: true,
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

  return {
    tenant,
    license,
    activeUsers,
    activeInvitations,
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
      isActive: true,
      trialExpiresAt: true,
      expiresAt: true,
      planConfig: {
        select: {
          id: true,
          name: true,
          slug: true,
          tier: true,
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
      isActive: true,
      trialExpiresAt: true,
      expiresAt: true,
      planConfig: {
        select: {
          id: true,
          name: true,
          slug: true,
          tier: true,
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
