import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, AccountType, TenantPlan, UserRole } from "@prisma/client";
import { hash } from "bcryptjs";

import { ensureTenantDefaultCategories } from "../lib/finance/default-categories";

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
  const passwordHash = await hash("changeme123", 10);

  const tenant = await prisma.tenant.upsert({
    where: {
      slug: "savepoint"
    },
    update: {
      name: "SavePoint",
      slug: "savepoint",
      plan: TenantPlan.pro,
      maxUsers: 5,
      isActive: true,
      trialStart: null,
      trialExpiresAt: null,
      expiresAt: null
    },
    create: {
      name: "SavePoint",
      slug: "savepoint",
      plan: TenantPlan.pro,
      maxUsers: 5
    }
  });

  const user = await prisma.user.upsert({
    where: {
      email: "admin@savepoint.local"
    },
    update: {
      passwordHash,
      role: UserRole.admin,
      isPlatformAdmin: true,
      isActive: true
    },
    create: {
      tenantId: tenant.id,
      email: "admin@savepoint.local",
      name: "Administrador SavePoint",
      passwordHash,
      role: UserRole.admin,
      isPlatformAdmin: true
    }
  });

  await prisma.userPreference.upsert({
    where: {
      userId: user.id
    },
    update: {},
    create: {
      userId: user.id
    }
  });

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
      balance: 12000
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
