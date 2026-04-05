import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/admin";
import { ensureTenantDefaultCategories } from "@/lib/finance/default-categories";
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

    const tenants = await prisma.tenant.findMany({
      where: {
        ...(admin.isPlatformAdmin ? {} : { id: admin.tenantId }),
        ...(plan === "free" || plan === "pro" ? { plan } : {}),
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
                ? { plan: "pro", trialExpiresAt: { gte: now }, expiresAt: null }
                : {})
      },
      include: {
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
        plan: tenant.plan,
        maxUsers: tenant.maxUsers,
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
      plan?: "free" | "pro";
      maxUsers?: number;
      trialDays?: number;
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
      return NextResponse.json({ message: "Já existe uma organização com esse nome ou slug" }, { status: 409 });
    }

    const plan = body.plan === "pro" ? "pro" : "free";
    const maxUsers = Math.max(1, body.maxUsers || (plan === "pro" ? 10 : 1));
    const trialDays = plan === "pro" ? Math.max(0, body.trialDays ?? 0) : 0;
    const now = new Date();

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        plan,
        maxUsers,
        isActive: true,
        trialStart: trialDays > 0 ? now : null,
        trialDays,
        trialExpiresAt: trialDays > 0 ? new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000) : null,
        expiresAt: null
      }
    });

    await ensureTenantDefaultCategories(tenant.id);

    return NextResponse.json(
      {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan
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
