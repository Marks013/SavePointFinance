import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, AccountType, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

import { ensureTenantDefaultCategories } from "../lib/finance/default-categories";
import { ensureDefaultPlans, getPreferredBootstrapPlan } from "../lib/licensing/default-plans";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const adapter = new PrismaPg({
  connectionString
});

const prisma = new PrismaClient({
  adapter
});

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim() || "admin@savepoint.local";
  const adminPassword = process.env.ADMIN_PASSWORD?.trim() || "changeme123";
  const ownerEmail = process.env.LOCAL_OWNER_EMAIL?.trim() || "owner@savepoint.local";
  const ownerPassword = process.env.LOCAL_OWNER_PASSWORD?.trim() || adminPassword;
  const familyEmail = process.env.FAMILY_USER_EMAIL?.trim();
  const familyPassword = process.env.FAMILY_USER_PASSWORD?.trim();
  const passwordHash = await hash(adminPassword, 10);
  const ownerPasswordHash = await hash(ownerPassword, 10);
  const familyPasswordHash = familyPassword ? await hash(familyPassword, 10) : null;
  await ensureDefaultPlans(prisma);
  const bootstrapPlan = await getPreferredBootstrapPlan(prisma);

  if (!bootstrapPlan) {
    throw new Error("No default plan available.");
  }

  const tenant = await prisma.tenant.upsert({
    where: {
      slug: "savepoint"
    },
    update: {
      name: "SavePoint",
      slug: "savepoint",
      planId: bootstrapPlan.id,
      isActive: true,
      trialStart: null,
      trialDays: 0,
      trialExpiresAt: null,
      expiresAt: null
    },
    create: {
      name: "SavePoint",
      slug: "savepoint",
      planId: bootstrapPlan.id,
      trialDays: 0
    }
  });

  const user = await prisma.user.upsert({
    where: {
      email: adminEmail
    },
    update: {
      passwordHash,
      role: UserRole.admin,
      isPlatformAdmin: true,
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      email: adminEmail,
      name: "Administrador SavePoint",
      passwordHash,
      role: UserRole.admin,
      isPlatformAdmin: true
    }
  });

  const owner = await prisma.user.upsert({
    where: {
      email: ownerEmail
    },
    update: {
      tenantId: tenant.id,
      passwordHash: ownerPasswordHash,
      role: UserRole.admin,
      isPlatformAdmin: false,
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      email: ownerEmail,
      name: "Titular SavePoint",
      passwordHash: ownerPasswordHash,
      role: UserRole.admin,
      isPlatformAdmin: false
    }
  });

  for (const seededUser of [user, owner]) {
    await prisma.userPreference.upsert({
      where: {
        userId: seededUser.id
      },
      update: {},
      create: {
        userId: seededUser.id
      }
    });
  }

  if (familyEmail && familyPasswordHash) {
    const family = await prisma.user.upsert({
      where: {
        email: familyEmail
      },
      update: {
        tenantId: tenant.id,
        passwordHash: familyPasswordHash,
        role: UserRole.member,
        isPlatformAdmin: false,
        isActive: true
      },
      create: {
        tenantId: tenant.id,
        email: familyEmail,
        name: "Familiar SavePoint",
        passwordHash: familyPasswordHash,
        role: UserRole.member,
        isPlatformAdmin: false
      }
    });

    await prisma.userPreference.upsert({
      where: {
        userId: family.id
      },
      update: {},
      create: {
        userId: family.id
      }
    });
  }

  await prisma.financialAccount.upsert({
    where: {
      id: "seed-cash-account"
    },
    update: {},
    create: {
      id: "seed-cash-account",
      tenantId: tenant.id,
      ownerUserId: user.id,
      name: "Conta Principal",
      type: AccountType.checking,
      openingBalance: 12000
    }
  });

  await ensureTenantDefaultCategories(tenant.id, prisma);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
