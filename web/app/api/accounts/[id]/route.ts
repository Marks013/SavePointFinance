import { NextResponse } from "next/server";

import { accountFormSchema } from "@/features/accounts/schemas/account-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateFinanceReports } from "@/lib/cache/finance-read-models";
import { captureRequestError } from "@/lib/observability/sentry";
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
    const body = accountFormSchema.parse(await request.json());
    const normalizedName = body.name.trim().replace(/\s+/g, " ");
    const existingAccount = await prisma.financialAccount.findFirst({
      where: {
        tenantId: user.tenantId,
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

    if (existingAccount) {
      return NextResponse.json({ message: "Já existe uma conta com esse nome" }, { status: 409 });
    }

    const updated = await prisma.financialAccount.update({
      where: {
        id,
        tenantId: user.tenantId
      },
      data: {
        name: normalizedName,
        type: body.type,
        openingBalance: body.balance,
        currency: body.currency.toUpperCase(),
        color: body.color,
        institution: body.institution?.trim() || null
      }
    });
    revalidateFinanceReports(user.tenantId);

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
      return NextResponse.json({ message: "Já existe uma conta com esse nome" }, { status: 409 });
    }

    captureRequestError(error, { request, feature: "accounts" });
    return NextResponse.json({ message: "Failed to update account" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;

    await prisma.financialAccount.delete({
      where: {
        id,
        tenantId: user.tenantId
      }
    });
    revalidateFinanceReports(user.tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "accounts" });
    return NextResponse.json({ message: "Failed to delete account" }, { status: 400 });
  }
}
