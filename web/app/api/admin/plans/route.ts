import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { ensureDefaultPlans } from "@/lib/licensing/default-plans";
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

function normalizeOptionalLimit(value: number | null | undefined) {
  if (typeof value !== "number") {
    return null;
  }

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser();

    if (!admin.isPlatformAdmin) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    await ensureDefaultPlans(prisma);
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const tier = searchParams.get("tier");
    const status = searchParams.get("status");

    const plans = await prisma.plan.findMany({
      where: {
        ...(tier === "free" || tier === "pro" ? { tier } : {}),
        ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { slug: { contains: search, mode: Prisma.QueryMode.insensitive } }
              ]
            }
          : {})
      },
      include: {
        _count: {
          select: {
            tenants: true
          }
        }
      },
      orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
    });

    return NextResponse.json({
      items: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        tier: plan.tier,
        description: plan.description,
        maxAccounts: plan.maxAccounts,
        maxCards: plan.maxCards,
        trialDays: plan.trialDays,
        isDefault: plan.isDefault,
        isActive: plan.isActive,
        sortOrder: plan.sortOrder,
        tenantsCount: plan._count.tenants,
        features: {
          whatsappAssistant: plan.whatsappAssistant,
          automation: plan.automation,
          pdfExport: plan.pdfExport
        }
      }))
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to load plans" }, { status: 500 });
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
      tier?: "free" | "pro";
      description?: string;
      maxAccounts?: number | null;
      maxCards?: number | null;
      trialDays?: number;
      whatsappAssistant?: boolean;
      automation?: boolean;
      pdfExport?: boolean;
    };

    const name = body.name?.trim();
    const slug = slugify(body.slug?.trim() || name || "");

    if (!name || !slug) {
      return NextResponse.json({ message: "Informe nome e slug válidos" }, { status: 400 });
    }

    const existing = await prisma.plan.findFirst({
      where: {
        OR: [
          { slug },
          { name: { equals: name, mode: Prisma.QueryMode.insensitive } }
        ]
      },
      select: { id: true }
    });

    if (existing) {
      return NextResponse.json({ message: "Já existe um plano com esse nome ou slug" }, { status: 409 });
    }

    const tier = body.tier === "pro" ? "pro" : "free";
    const plan = await prisma.plan.create({
      data: {
        name,
        slug,
        tier,
        description: body.description?.trim() || null,
        maxAccounts: normalizeOptionalLimit(body.maxAccounts),
        maxCards: normalizeOptionalLimit(body.maxCards),
        trialDays: Math.max(0, body.trialDays ?? 0),
        whatsappAssistant: Boolean(body.whatsappAssistant),
        automation: Boolean(body.automation),
        pdfExport: Boolean(body.pdfExport),
        isDefault: false,
        isActive: true,
        sortOrder: 100
      }
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      action: "plan.created",
      entityType: "plan",
      entityId: plan.id,
      summary: `Plano criado: ${plan.name}`,
      metadata: {
        tier: plan.tier
      }
    });

    return NextResponse.json({ id: plan.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to create plan" }, { status: 400 });
  }
}
