import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  try {
    const admin = await requireAdminUser();
    const tenantScope = admin.isPlatformAdmin ? {} : { id: admin.tenantId };
    const userScope = admin.isPlatformAdmin ? {} : { tenantId: admin.tenantId };
    const transactionScope = admin.isPlatformAdmin ? {} : { tenantId: admin.tenantId };
    const currentTenantUserScope = { tenantId: admin.tenantId };

    const now = new Date();
    const [
      tenants,
      activeTenants,
      trialTenants,
      expiredTenants,
      users,
      activeUsers,
      transactions,
      billingActiveSubscriptions,
      billingAttentionSubscriptions,
      billingWebhookQueueDepth,
      billingWebhookFailures,
      currentTenantUsers,
      currentTenantActiveUsers
    ] = await Promise.all([
      prisma.tenant.count({ where: tenantScope }),
      prisma.tenant.count({ where: { ...tenantScope, isActive: true } }),
      prisma.tenant.count({
        where: {
          ...tenantScope,
          planConfig: {
            is: {
              tier: "pro"
            }
          },
          trialExpiresAt: {
            gte: now
          },
          expiresAt: null
        }
      }),
      prisma.tenant.count({
        where: {
          ...tenantScope,
          expiresAt: {
            lt: now
          }
        }
      }),
      prisma.user.count({ where: userScope }),
      prisma.user.count({ where: { ...userScope, isActive: true } }),
      prisma.transaction.count({ where: transactionScope }),
      prisma.billingSubscription.count({
        where: {
          ...(admin.isPlatformAdmin ? {} : { tenantId: admin.tenantId }),
          status: "authorized"
        }
      }),
      prisma.billingSubscription.count({
        where: {
          ...(admin.isPlatformAdmin ? {} : { tenantId: admin.tenantId }),
          status: {
            in: ["paused", "payment_required", "rejected", "expired"]
          }
        }
      }),
      prisma.billingWebhookEvent.count({
        where: {
          status: {
            in: ["pending", "processing", "failed"]
          }
        }
      }),
      prisma.billingWebhookEvent.count({
        where: {
          status: "dead_letter"
        }
      }),
      prisma.user.count({ where: currentTenantUserScope }),
      prisma.user.count({ where: { ...currentTenantUserScope, isActive: true } })
    ]);

    return NextResponse.json({
      totalTenants: tenants,
      activeTenants,
      trialTenants,
      expiredTenants,
      totalUsers: users,
      activeUsers,
      totalTransactions: transactions,
      billingActiveSubscriptions,
      billingAttentionSubscriptions,
      billingWebhookQueueDepth,
      billingWebhookFailures,
      currentTenantUsers,
      currentTenantActiveUsers
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to load admin stats" }, { status: 500 });
  }
}
