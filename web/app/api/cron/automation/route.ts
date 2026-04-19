import { NextResponse } from "next/server";

import { runRecurringAutomation } from "@/lib/automation/subscriptions";
import { serverEnv } from "@/lib/env/server";
import { resolveTenantLicenseState } from "@/lib/licensing/policy";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { processQueuedWhatsAppWebhookEvents } from "@/lib/whatsapp/async-processor";

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const fallbackToken = request.headers.get("x-automation-secret");

  return bearerToken === serverEnv.AUTOMATION_CRON_SECRET || fallbackToken === serverEnv.AUTOMATION_CRON_SECRET;
}

async function pruneWebhookEvents() {
  return prisma.$executeRaw`
    DELETE FROM "WebhookEvent"
    WHERE "createdAt" < NOW() - INTERVAL '30 days'
  `;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const tenants = await prisma.tenant.findMany({
      where: {
        isActive: true
      },
      include: {
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
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    const results = [];

    for (const tenant of tenants) {
      const operator = await prisma.user.findFirst({
        where: {
          tenantId: tenant.id,
          isActive: true
        },
        orderBy: [{ role: "desc" }, { createdAt: "asc" }]
      });

      if (!operator) {
        results.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          skipped: true,
          reason: "No active user available"
        });
        continue;
      }

      const license = resolveTenantLicenseState(tenant);

      if (!license.canAccessApp || !license.features.automation) {
        results.push({
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          skipped: true,
          reason: "Automation unavailable for current license"
        });
        continue;
      }

      const result = await runRecurringAutomation(tenant.id, operator.id);
      results.push({
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        skipped: false,
        ...result
      });
    }

    const whatsappWebhookQueue = await processQueuedWhatsAppWebhookEvents();
    const prunedWebhookEvents = await pruneWebhookEvents();

    return NextResponse.json({
      processedTenants: results.filter((item) => !item.skipped).length,
      skippedTenants: results.filter((item) => item.skipped).length,
      whatsappWebhookQueue,
      prunedWebhookEvents,
      results
    });
  } catch (error) {
    captureRequestError(error, { request, feature: "automation-cron", surface: "cron" });
    return NextResponse.json({ message: "Failed to run automation cron" }, { status: 500 });
  }
}
