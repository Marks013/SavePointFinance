import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { resolveTransactionClassification } from "@/lib/finance/transaction-classification";
import { assertTenantTransactionReferences, TenantReferenceError } from "@/lib/finance/tenant-reference-guard";
import { ensureTitheCategory, syncTitheForTransactionDates } from "@/lib/finance/tithe";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { addMonthsClamped } from "@/lib/utils";
import { format } from "date-fns";
import { transactionUpdateSchema } from "@/features/transactions/schemas/transaction-schema";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

function buildInstallmentDescription(description: string, installmentNumber: number, installmentsTotal: number) {
  return installmentsTotal > 1 ? `${description} (${installmentNumber}/${installmentsTotal})` : description;
}

export async function PATCH(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const body = transactionUpdateSchema.parse(await request.json());
    const existingTransaction = await prisma.transaction.findFirstOrThrow({
      where: {
        id,
        tenantId: user.tenantId
      },
      select: {
        id: true,
        date: true,
        titheAmount: true,
        notes: true,
        userId: true,
        installmentsTotal: true,
        installmentNumber: true,
        parentId: true
      }
    });

    if (existingTransaction.notes?.startsWith("[AUTO_TITHE:")) {
      return NextResponse.json({ message: "O dízimo consolidado é gerado automaticamente" }, { status: 400 });
    }

    const notes = body.notes?.trim() || null;

    await assertTenantTransactionReferences({
      tenantId: user.tenantId,
      accountId: body.accountId,
      destinationAccountId: body.destinationAccountId,
      cardId: body.cardId,
      categoryId: body.categoryId
    });

    const classification = await resolveTransactionClassification({
      tenantId: user.tenantId,
      type: body.type,
      description: body.description,
      notes,
      paymentMethod: body.paymentMethod,
      categoryId: body.categoryId || null,
      excludeTransactionId: id
    });
    const categoryId = classification.categoryId;
    const applyTithe = body.type === "income" && body.applyTithe;
    const titheCategoryId = applyTithe ? await ensureTitheCategory(user.tenantId) : null;
    const updatedDate = new Date(`${body.date}T12:00:00`);
    const selectedCard =
      body.paymentMethod === "credit_card" && body.cardId
        ? await prisma.card.findFirst({
            where: {
              id: body.cardId,
              tenantId: user.tenantId,
              isActive: true
            },
            select: {
              id: true,
              closeDay: true,
              dueDay: true
            }
          })
        : null;

    if (body.paymentMethod === "credit_card" && body.cardId && !selectedCard) {
      return NextResponse.json({ message: "Cartão selecionado não foi encontrado" }, { status: 404 });
    }

    const competenceForSingleUpdate = body.competence || format(updatedDate, "yyyy-MM");
    const baseCompetenceDate = new Date(`${competenceForSingleUpdate}-15T12:00:00`);
    const groupRootId = existingTransaction.parentId ?? (existingTransaction.installmentsTotal > 1 ? existingTransaction.id : null);
    const updateWholeGroup = body.editScope === "group" && Boolean(groupRootId);

    if (updateWholeGroup && groupRootId) {
      const installments = await prisma.transaction.findMany({
        where: {
          tenantId: user.tenantId,
          OR: [{ id: groupRootId }, { parentId: groupRootId }]
        },
        orderBy: {
          installmentNumber: "asc"
        }
      });

      if (!installments.length) {
        return NextResponse.json({ message: "Grupo de parcelas não encontrado" }, { status: 404 });
      }

      const affectedDatesBefore = installments.map((installment) => installment.date);

      await prisma.$transaction(
        installments.map((installment) => {
          const monthOffset = installment.installmentNumber - existingTransaction.installmentNumber;
          const nextDate = addMonthsClamped(updatedDate, monthOffset);
          const nextCompetenceDate = addMonthsClamped(baseCompetenceDate, monthOffset);

          return prisma.transaction.update({
            where: {
              id: installment.id
            },
            data: {
              date: nextDate,
              competence: format(nextCompetenceDate, "yyyy-MM"),
              amount: new Prisma.Decimal(body.amount.toFixed(2)),
              description: buildInstallmentDescription(body.description, installment.installmentNumber, installment.installmentsTotal),
              type: body.type,
              paymentMethod: body.paymentMethod,
              categoryId,
              accountId: body.accountId || null,
              destinationAccountId: body.destinationAccountId || null,
              cardId: body.cardId || null,
              notes,
              titheAmount: applyTithe ? new Prisma.Decimal((body.amount * 0.1).toFixed(2)) : null,
              titheCategoryId,
              classificationSource: classification.classificationSource,
              classificationKeyword: classification.classificationKeyword,
              classificationReason: classification.reason,
              classificationVersion: 2,
              aiClassified: classification.aiClassified,
              aiConfidence:
                classification.confidence !== null ? new Prisma.Decimal(classification.confidence.toFixed(2)) : null
            }
          });
        })
      );

      if (applyTithe || installments.some((installment) => Number(installment.titheAmount ?? 0) > 0)) {
        await syncTitheForTransactionDates({
          tenantId: user.tenantId,
          userId: existingTransaction.userId ?? user.id,
          dates: [
            ...affectedDatesBefore,
            ...installments.map((installment) =>
              addMonthsClamped(updatedDate, installment.installmentNumber - existingTransaction.installmentNumber)
            )
          ]
        });
      }

      return NextResponse.json({
        id,
        scope: "group"
      });
    }

    const updated = await prisma.transaction.update({
      where: {
        id
      },
      data: {
        date: updatedDate,
        competence: competenceForSingleUpdate,
        amount: new Prisma.Decimal(body.amount.toFixed(2)),
        description: buildInstallmentDescription(body.description, existingTransaction.installmentNumber, existingTransaction.installmentsTotal),
        type: body.type,
        paymentMethod: body.paymentMethod,
        categoryId,
        accountId: body.accountId || null,
        destinationAccountId: body.destinationAccountId || null,
        cardId: body.cardId || null,
        notes,
        titheAmount: applyTithe ? new Prisma.Decimal((body.amount * 0.1).toFixed(2)) : null,
        titheCategoryId,
        classificationSource: classification.classificationSource,
        classificationKeyword: classification.classificationKeyword,
        classificationReason: classification.reason,
        classificationVersion: 2,
        aiClassified: classification.aiClassified,
        aiConfidence:
          classification.confidence !== null ? new Prisma.Decimal(classification.confidence.toFixed(2)) : null
      }
    });

    if (applyTithe || Number(existingTransaction.titheAmount ?? 0) > 0) {
      await syncTitheForTransactionDates({
        tenantId: user.tenantId,
        userId: existingTransaction.userId ?? user.id,
        dates: [existingTransaction.date, updatedDate]
      });
    }

    return NextResponse.json({
      id: updated.id,
      scope: "single"
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof TenantReferenceError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    captureRequestError(error, { request, feature: "transactions" });
    return NextResponse.json({ message: error instanceof Error ? error.message : "Failed to update transaction" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const existingTransaction = await prisma.transaction.findFirstOrThrow({
      where: {
        id,
        tenantId: user.tenantId
      },
      select: {
        date: true,
        titheAmount: true,
        notes: true,
        userId: true
      }
    });

    if (existingTransaction.notes?.startsWith("[AUTO_TITHE:")) {
      return NextResponse.json({ message: "O dízimo consolidado é gerado automaticamente" }, { status: 400 });
    }

    await prisma.transaction.delete({
      where: {
        id
      }
    });

    if (Number(existingTransaction.titheAmount ?? 0) > 0) {
      await syncTitheForTransactionDates({
        tenantId: user.tenantId,
        userId: existingTransaction.userId ?? user.id,
        dates: [existingTransaction.date]
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "transactions" });
    return NextResponse.json({ message: "Failed to delete transaction" }, { status: 400 });
  }
}
