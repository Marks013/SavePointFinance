import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma/client";

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const tenantId = searchParams.get("tenantId")?.trim();
    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const lastLogin = searchParams.get("lastLogin");
    const sort = searchParams.get("sort") ?? "created_desc";
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? "12") || 12));
    const recentLoginSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const where: Prisma.UserWhereInput = {
      ...(admin.isPlatformAdmin ? (tenantId ? { tenantId } : {}) : { tenantId: admin.tenantId }),
      ...(role === "admin" || role === "member" ? { role } : {}),
      ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
      ...(lastLogin === "never"
        ? { lastLogin: null }
        : lastLogin === "recent"
          ? { lastLogin: { gte: recentLoginSince } }
          : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { email: { contains: search, mode: Prisma.QueryMode.insensitive } },
              ...(admin.isPlatformAdmin
                ? [{ tenant: { is: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } } }]
                : [])
            ]
          }
        : {})
    };
    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      sort === "created_asc"
        ? [{ createdAt: "asc" }]
        : sort === "name_asc"
          ? [{ name: "asc" }]
          : sort === "login_desc"
            ? [{ lastLogin: "desc" }, { createdAt: "desc" }]
            : [{ createdAt: "desc" }];

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          tenant: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      prisma.user.count({ where })
    ]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
      page,
      pageSize,
      total,
      totalPages,
      items: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isPlatformAdmin: user.isPlatformAdmin,
        isActive: user.isActive,
        tenant: user.tenant,
        createdAt: user.createdAt.toISOString(),
        lastLogin: user.lastLogin?.toISOString() ?? null
      }))
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to load users" }, { status: 500 });
  }
}
