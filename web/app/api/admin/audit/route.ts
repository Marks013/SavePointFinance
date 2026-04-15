import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma/client";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get("tenantId")?.trim();
    const action = searchParams.get("action")?.trim();
    const search = searchParams.get("search")?.trim();
    const filters: Prisma.AdminAuditLogWhereInput[] = [];

    if (admin.isPlatformAdmin) {
      if (tenantId) {
        filters.push({
          OR: [{ actorTenantId: tenantId }, { targetTenantId: tenantId }]
        });
      }
    } else {
      filters.push({
          OR: [{ actorTenantId: admin.tenantId }, { targetTenantId: admin.tenantId }]
      });
    }

    if (action) {
      filters.push({ action });
    }

    if (search) {
      filters.push({
        OR: [
          { summary: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { entityType: { contains: search, mode: Prisma.QueryMode.insensitive } },
          { actorUser: { is: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } } },
          { actorUser: { is: { email: { contains: search, mode: Prisma.QueryMode.insensitive } } } },
          { targetUser: { is: { email: { contains: search, mode: Prisma.QueryMode.insensitive } } } },
          { targetTenant: { is: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } } }
        ]
      });
    }

    const items = await prisma.adminAuditLog.findMany({
      where: filters.length > 0 ? { AND: filters } : undefined,
      include: {
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        targetUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        targetTenant: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    return NextResponse.json({
      items: items.map((item) => ({
        id: item.id,
        action: item.action,
        entityType: item.entityType,
        entityId: item.entityId,
        summary: item.summary,
        metadata: item.metadata,
        createdAt: item.createdAt.toISOString(),
        actorUser: item.actorUser,
        targetUser: item.targetUser,
        targetTenant: item.targetTenant
      }))
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to load audit logs" }, { status: 500 });
  }
}
