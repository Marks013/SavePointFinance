import { NextResponse } from "next/server";

import { cardFormSchema } from "@/features/cards/schemas/card-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { freezeCardStatementSnapshotsBeforeCardUpdate } from "@/lib/cards/snapshot-sync";
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
    const body = cardFormSchema.parse(await request.json());
    const normalizedName = body.name.trim().replace(/\s+/g, " ");
    const existingCard = await prisma.card.findFirst({
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

    if (existingCard) {
      return NextResponse.json({ message: "Já existe um cartão com esse nome" }, { status: 409 });
    }

    await freezeCardStatementSnapshotsBeforeCardUpdate(user.tenantId, id);

    const updated = await prisma.card.update({
      where: {
        id,
        tenantId: user.tenantId
      },
      data: {
        name: normalizedName,
        brand: body.brand,
        last4: body.last4 || null,
        limitAmount: body.limitAmount,
        dueDay: body.dueDay,
        closeDay: body.closeDay,
        statementMonthAnchor: body.statementMonthAnchor,
        color: body.color,
        institution: body.institution?.trim() || null
      }
    });

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
      return NextResponse.json({ message: "Já existe um cartão com esse nome" }, { status: 409 });
    }

    captureRequestError(error, { request, feature: "cards" });
    return NextResponse.json({ message: "Failed to update card" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;

    await prisma.card.delete({
      where: {
        id,
        tenantId: user.tenantId
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "cards" });
    return NextResponse.json({ message: "Failed to delete card" }, { status: 400 });
  }
}
