import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

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

const createPlanSchema = z.object({
  name: z.string().trim().min(1),
  slug: z.string().trim().optional().nullable(),
  tier: z.enum(["free", "pro"]).optional().default("free"),
  description: z.string().trim().optional().nullable(),
  maxAccounts: z.coerce.number().int().positive().optional().nullable(),
  maxCards: z.coerce.number().int().positive().optional().nullable(),
  trialDays: z.coerce.number().int().min(0).max(365).optional().default(0),
  whatsappAssistant: z.boolean().optional().default(false),
  automation: z.boolean().optional().default(false),
  pdfExport: z.boolean().optional().default(false)
}).strict();

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

    const body = createPlanSchema.parse(await request.json());

    const name = body.name;
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

    const plan = await prisma.plan.create({
      data: {
        name,
        slug,
        tier: body.tier,
        description: body.description?.trim() || null,
        maxAccounts: normalizeOptionalLimit(body.maxAccounts),
        maxCards: normalizeOptionalLimit(body.maxCards),
        trialDays: body.trialDays,
        whatsappAssistant: body.whatsappAssistant,
        automation: body.automation,
        pdfExport: body.pdfExport,
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
