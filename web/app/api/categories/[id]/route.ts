import { NextResponse } from "next/server";

import { categoryFormSchema } from "@/features/categories/schemas/category-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { invalidateTenantClassificationCache } from "@/lib/finance/classification-cache";
import { buildCategoryKeywords, getDefaultCategorySystemKey, normalizeCategoryName } from "@/lib/finance/default-categories";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
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
        id: {
          not: id
        },
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

    const updated = await prisma.category.update({
      where: {
        id,
        tenantId: user.tenantId
      },
      data: {
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

    return NextResponse.json(updated);
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

    return NextResponse.json({ message: "Failed to update category" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;

    const transactionUsingCategory = await prisma.transaction.findFirst({
      where: {
        tenantId: user.tenantId,
        OR: [{ categoryId: id }, { titheCategoryId: id }]
      },
      select: { id: true }
    });

    if (transactionUsingCategory) {
      return NextResponse.json(
        { message: "Categoria possui transacoes vinculadas" },
        { status: 400 }
      );
    }

    await prisma.category.delete({
      where: {
        id,
        tenantId: user.tenantId
      }
    });

    invalidateTenantClassificationCache(user.tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to delete category" }, { status: 400 });
  }
}
