import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma/client";

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
