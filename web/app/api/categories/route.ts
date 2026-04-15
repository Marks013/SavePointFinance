import { NextResponse } from "next/server";

import { categoryFormSchema } from "@/features/categories/schemas/category-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateFinanceReports } from "@/lib/cache/finance-read-models";
import { invalidateTenantClassificationCache } from "@/lib/finance/classification-cache";
import {
  buildCategoryKeywords,
  dedupeTenantCategories,
  getDefaultCategorySystemKey,
  normalizeCategoryName
} from "@/lib/finance/default-categories";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await dedupeTenantCategories(user.tenantId);
    invalidateTenantClassificationCache(user.tenantId);
    const categories = await prisma.category.findMany({
      where: {
        tenantId: user.tenantId
      },
      orderBy: [{ type: "asc" }, { name: "asc" }]
    });

    return NextResponse.json({
      items: categories.map((category) => ({
        id: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
        type: category.type,
        isDefault: category.isDefault,
        monthlyLimit: category.monthlyLimit ? Number(category.monthlyLimit) : null,
        keywords: category.keywords
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "categories" });
    return NextResponse.json({ message: "Failed to load categories" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    await dedupeTenantCategories(user.tenantId);
    invalidateTenantClassificationCache(user.tenantId);
    const body = categoryFormSchema.parse(await request.json());
    const normalizedName = normalizeCategoryName(body.name);
    const keywords = buildCategoryKeywords(
      normalizedName,
      body.keywords
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean)
    );
    const existingCategory = await prisma.category.findFirst({
      where: {
        tenantId: user.tenantId,
        type: body.type,
        name: {
          equals: normalizedName,
          mode: "insensitive"
        }
      },
      select: {
        id: true
      }
    });

    if (existingCategory) {
      return NextResponse.json({ message: "Já existe uma categoria com esse nome nesse tipo" }, { status: 409 });
    }

    const category = await prisma.category.create({
      data: {
        tenantId: user.tenantId,
        name: normalizedName,
        systemKey: getDefaultCategorySystemKey(body.type, normalizedName),
        icon: body.icon,
        color: body.color,
        type: body.type,
        monthlyLimit: body.monthlyLimit ? body.monthlyLimit : null,
        keywords
      }
    });

    invalidateTenantClassificationCache(user.tenantId);
    revalidateFinanceReports(user.tenantId);

    return NextResponse.json(
      {
        id: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
        type: category.type,
        isDefault: category.isDefault,
        monthlyLimit: category.monthlyLimit ? Number(category.monthlyLimit) : null,
        keywords: category.keywords
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ message: "Já existe uma categoria com esse nome nesse tipo" }, { status: 409 });
    }

    captureRequestError(error, { request, feature: "categories" });
    return NextResponse.json({ message: "Failed to create category" }, { status: 400 });
  }
}
