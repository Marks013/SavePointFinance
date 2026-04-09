import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { invalidateTenantClassificationCache } from "@/lib/finance/classification-cache";
import { ensureTenantDefaultCategories } from "@/lib/finance/default-categories";
import { prisma } from "@/lib/prisma/client";

export async function POST() {
  try {
    const user = await requireSessionUser();
    const before = await prisma.category.count({
      where: {
        tenantId: user.tenantId
      }
    });

    await ensureTenantDefaultCategories(user.tenantId);
    invalidateTenantClassificationCache(user.tenantId);

    const after = await prisma.category.count({
      where: {
        tenantId: user.tenantId
      }
    });

    return NextResponse.json({
      success: true,
      restored: Math.max(0, after - before),
      total: after
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to restore default categories" }, { status: 400 });
  }
}
