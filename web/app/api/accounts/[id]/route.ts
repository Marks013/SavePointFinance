import { NextResponse } from "next/server";

import { accountFormSchema } from "@/features/accounts/schemas/account-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateFinanceReports } from "@/lib/cache/finance-read-models";
import { FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS } from "@/lib/finance/benefit-wallet-rules";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

const FOOD_BENEFIT_CATEGORY_KEYS = [...FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS];

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
    const currentAccount = await prisma.financialAccount.findFirst({
      where: {
        id,
        tenantId: user.tenantId
      },
      select: {
        id: true,
        usage: true
      }
    });

    if (!currentAccount) {
      return NextResponse.json({ message: "Conta não encontrada" }, { status: 404 });
    }

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

    const isTransitioningToBenefitWallet =
      currentAccount.usage !== "benefit_food" && body.usage === "benefit_food";

    if (isTransitioningToBenefitWallet) {
      const [invalidTransaction, invalidSubscription] = await Promise.all([
        prisma.transaction.findFirst({
          where: {
            tenantId: user.tenantId,
            OR: [
              {
                type: "transfer",
                OR: [{ accountId: id }, { destinationAccountId: id }]
              },
              {
                accountId: id,
                OR: [{ paymentMethod: "credit_card" }, { cardId: { not: null } }]
              },
              {
                accountId: id,
                type: "expense",
                NOT: {
                  category: {
                    is: {
                      type: "expense",
                      systemKey: {
                        in: FOOD_BENEFIT_CATEGORY_KEYS
                      }
                    }
                  }
                }
              }
            ]
          },
          select: {
            id: true
          }
        }),
        prisma.subscription.findFirst({
          where: {
            tenantId: user.tenantId,
            accountId: id,
            OR: [
              {
                cardId: {
                  not: null
                }
              },
              {
                type: "expense",
                NOT: {
                  category: {
                    is: {
                      type: "expense",
                      systemKey: {
                        in: FOOD_BENEFIT_CATEGORY_KEYS
                      }
                    }
                  }
                }
              }
            ]
          },
          select: {
            id: true
          }
        })
      ]);

      if (invalidTransaction || invalidSubscription) {
        return NextResponse.json(
          {
            message:
              "Nao foi possivel converter a conta para Vale Alimentacao porque ja existem movimentacoes ou recorrencias incompativeis no historico."
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.financialAccount.update({
      where: {
        id,
        tenantId: user.tenantId
      },
      data: {
        name: normalizedName,
        type: body.type,
        usage: body.usage,
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
