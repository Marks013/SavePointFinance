import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/admin";
import { ensureTenantDefaultCategories } from "@/lib/finance/default-categories";
import { applyPlanDefaultsToTenant, ensureDefaultPlans } from "@/lib/licensing/default-plans";
import { prisma } from "@/lib/prisma/client";

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function getBillingMode(metadata: unknown) {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const mode = (metadata as Record<string, unknown>).billingMode;
    return typeof mode === "string" ? mode : "monthly_recurring";
  }

  return "monthly_recurring";
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const plan = searchParams.get("plan");
    const status = searchParams.get("status");
    const now = new Date();

    await ensureDefaultPlans(prisma);

    const tenants = await prisma.tenant.findMany({
      where: {
        ...(admin.isPlatformAdmin ? {} : { id: admin.tenantId }),
        ...(plan === "free" || plan === "pro"
          ? {
              planConfig: {
                is: {
                  tier: plan
                }
              }
            }
          : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { slug: { contains: search, mode: "insensitive" } }
              ]
            }
          : {}),
        ...(status === "active"
          ? { isActive: true }
          : status === "inactive"
            ? { isActive: false }
            : status === "expired"
              ? { expiresAt: { lt: now } }
              : status === "trial"
                ? {
                    planConfig: {
                      is: {
                        tier: "pro"
                      }
                    },
                    trialExpiresAt: { gte: now },
                    expiresAt: null
                  }
                : {})
      },
      include: {
        planConfig: {
          select: {
            id: true,
            name: true,
            slug: true,
            tier: true,
            description: true,
            maxAccounts: true,
            maxCards: true,
            whatsappAssistant: true,
            automation: true,
            pdfExport: true,
            trialDays: true,
            isDefault: true,
            isActive: true
          }
        },
        users: {
          where: {
            isActive: true
          },
          select: {
            id: true
          }
        },
        billingSubscriptions: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1,
          select: {
            id: true,
            status: true,
            mercadoPagoPreapprovalId: true,
            externalReference: true,
            metadata: true,
            nextBillingAt: true,
            cancelRequestedAt: true,
            lastSyncedAt: true,
            payments: {
              orderBy: {
                createdAt: "desc"
              },
              take: 1,
              select: {
                id: true,
                status: true,
                providerPaymentId: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    const latestSubscriptionByTenant = new Map(
      tenants
        .map((tenant) => [tenant.id, tenant.billingSubscriptions[0] ?? null] as const)
    );
    const resourceIds = Array.from(
      new Set(
        tenants.flatMap((tenant) => {
          const subscription = tenant.billingSubscriptions[0];
          return [
            subscription?.mercadoPagoPreapprovalId ?? null,
            subscription?.payments[0]?.providerPaymentId ?? null
          ].filter((value): value is string => Boolean(value));
        })
      )
    );
    const webhookEvents = resourceIds.length
      ? await prisma.billingWebhookEvent.findMany({
          where: {
            resourceId: {
              in: resourceIds
            },
            status: {
              in: ["pending", "processing", "failed", "dead_letter"]
            }
          },
          select: {
            resourceId: true,
            status: true
          }
        })
      : [];
    const webhookSummaryByResourceId = webhookEvents.reduce<Record<string, { queueDepth: number; failed: number }>>(
      (accumulator, event) => {
        const summary = accumulator[event.resourceId] ?? {
          queueDepth: 0,
          failed: 0
        };

        if (event.status === "pending" || event.status === "processing") {
          summary.queueDepth += 1;
        }

        if (event.status === "failed" || event.status === "dead_letter") {
          summary.failed += 1;
        }

        accumulator[event.resourceId] = summary;
        return accumulator;
      },
      {}
    );
    const tenantIds = tenants.map((tenant) => tenant.id);
    const repairAuditActions = [
      "finance.tithe.recalculated",
      "finance.subscriptions.synced",
      "finance.installments.reconciled"
    ] as const;
    const latestRepairAuditEntries = tenantIds.length
      ? await prisma.adminAuditLog.findMany({
          where: {
            targetTenantId: {
              in: tenantIds
            },
            action: {
              in: [...repairAuditActions]
            }
          },
          orderBy: [{ createdAt: "desc" }],
          select: {
            targetTenantId: true,
            action: true,
            summary: true,
            createdAt: true
          }
        })
      : [];
    const latestRepairByTenantId = latestRepairAuditEntries.reduce<
      Record<string, { action: string; summary: string; createdAt: string }>
    >((accumulator, entry) => {
      if (!entry.targetTenantId || accumulator[entry.targetTenantId]) {
        return accumulator;
      }

      accumulator[entry.targetTenantId] = {
        action: entry.action,
        summary: entry.summary,
        createdAt: entry.createdAt.toISOString()
      };

      return accumulator;
    }, {});

    return NextResponse.json({
      items: tenants.map((tenant) => ({
        billing: (() => {
          const subscription = latestSubscriptionByTenant.get(tenant.id);
          const webhookSummary = [
            subscription?.mercadoPagoPreapprovalId ?? null,
            subscription?.payments[0]?.providerPaymentId ?? null
          ]
            .filter((value): value is string => Boolean(value))
            .reduce(
              (summary, resourceId) => {
                const resourceSummary = webhookSummaryByResourceId[resourceId];

                if (!resourceSummary) {
                  return summary;
                }

                return {
                  queueDepth: summary.queueDepth + resourceSummary.queueDepth,
                  failed: summary.failed + resourceSummary.failed
                };
              },
              { queueDepth: 0, failed: 0 }
            );

          return {
            subscriptionId: subscription?.id ?? null,
            subscriptionStatus: subscription?.status ?? null,
            preapprovalId: subscription?.mercadoPagoPreapprovalId ?? null,
            externalReference: subscription?.externalReference ?? null,
            billingMode: subscription ? getBillingMode(subscription.metadata) : null,
            nextBillingAt: subscription?.nextBillingAt?.toISOString() ?? null,
            cancelRequestedAt: subscription?.cancelRequestedAt?.toISOString() ?? null,
            lastSyncedAt: subscription?.lastSyncedAt?.toISOString() ?? null,
            latestPaymentStatus: subscription?.payments[0]?.status ?? null,
            latestPaymentId: subscription?.payments[0]?.providerPaymentId ?? null,
            queueDepth: webhookSummary.queueDepth,
            failedWebhooks: webhookSummary.failed,
            lastFinancialRepair: latestRepairByTenantId[tenant.id] ?? null
          };
        })(),
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        planId: tenant.planConfig.id,
        planName: tenant.planConfig.name,
        planSlug: tenant.planConfig.slug,
        planTier: tenant.planConfig.tier,
        isActive: tenant.isActive,
        activeUsers: tenant.users.length,
        trialStart: tenant.trialStart?.toISOString() ?? null,
        trialDays: tenant.trialDays,
        trialExpiresAt: tenant.trialExpiresAt?.toISOString() ?? null,
        expiresAt: tenant.expiresAt?.toISOString() ?? null,
        createdAt: tenant.createdAt.toISOString()
      }))
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to load tenants" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdminUser();

    if (!admin.isPlatformAdmin) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      planId?: string;
    };

    const name = body.name?.trim();
    const providedSlug = body.slug?.trim();
    const slug = slugify(providedSlug || name || "");

    if (!name || !slug) {
      return NextResponse.json({ message: "Informe nome e slug válidos" }, { status: 400 });
    }

    const existing = await prisma.tenant.findFirst({
      where: {
        OR: [
          { slug },
          { name: { equals: name, mode: "insensitive" } }
        ]
      },
      select: { id: true }
    });

    if (existing) {
      return NextResponse.json({ message: "Já existe uma conta com esse nome ou identificador" }, { status: 409 });
    }

    await ensureDefaultPlans(prisma);
    const requestedPlanId = body.planId?.trim();

    if (!requestedPlanId) {
      return NextResponse.json({ message: "Selecione o plano inicial da conta" }, { status: 400 });
    }

    const plan = await prisma.plan.findFirst({
      where: {
        id: requestedPlanId,
        isActive: true
      }
    });

    if (!plan) {
      return NextResponse.json({ message: "Nenhum plano ativo foi encontrado" }, { status: 400 });
    }

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        ...applyPlanDefaultsToTenant(plan),
        isActive: true,
        expiresAt: null
      }
    });

    await ensureTenantDefaultCategories(tenant.id);

    return NextResponse.json(
      {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        planId: tenant.planId,
        planName: plan.name,
        planTier: plan.tier
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to create tenant" }, { status: 400 });
  }
}
