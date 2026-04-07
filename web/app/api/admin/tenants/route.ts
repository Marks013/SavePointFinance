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
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    return NextResponse.json({
      items: tenants.map((tenant) => ({
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

    const plan = body.planId
      ? await prisma.plan.findFirst({
          where: {
            id: body.planId,
            isActive: true
          }
        })
      : await prisma.plan.findFirst({
          where: {
            isDefault: true,
            isActive: true
          },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
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
