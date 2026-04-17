import { NextResponse } from "next/server";

import { accountFormSchema } from "@/features/accounts/schemas/account-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateFinanceReports } from "@/lib/cache/finance-read-models";
import { getAccountsWithComputedBalance } from "@/lib/finance/accounts";
import { canCreateAccount } from "@/lib/licensing/server";
import { getMonthRange, normalizeMonthKey } from "@/lib/month";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

function readAccountUsage(account: unknown) {
  return (account as { usage?: "standard" | "benefit_food" }).usage ?? "standard";
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const resolvedMonth = month ? normalizeMonthKey(month) : null;
    const monthRange = resolvedMonth ? getMonthRange(resolvedMonth) : null;
    const accounts = await getAccountsWithComputedBalance(
      user.tenantId,
      undefined,
      monthRange
        ? {
            start: monthRange.start,
            end: monthRange.end
          }
        : undefined
    );

    return NextResponse.json({
      items: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        usage: account.usage,
        balance: account.currentBalance,
        openingBalance: account.openingBalance,
        currency: account.currency,
        color: account.color,
        institution: account.institution,
        accumulatedNet: account.accumulatedNet,
        periodIncome: account.periodIncome,
        periodExpense: account.periodExpense,
        periodTransferIn: account.periodTransferIn,
        periodTransferOut: account.periodTransferOut,
        periodNet: account.periodNet
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "accounts" });
    return NextResponse.json({ message: "Failed to load accounts" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = accountFormSchema.parse(await request.json());
    const usage = await canCreateAccount(user.tenantId, user.id);

    if (!usage?.license.canAccessApp) {
      return NextResponse.json({ message: "Plano indisponível para criar contas" }, { status: 403 });
    }

    if (!usage.allowed) {
      return NextResponse.json(
        {
          message:
            usage.limit === 1
              ? "O plano atual permite apenas 1 conta ativa"
              : `O plano atual permite até ${usage.limit} contas ativas`
        },
        { status: 409 }
      );
    }

    const normalizedName = body.name.trim().replace(/\s+/g, " ");
    const existingAccount = await prisma.financialAccount.findFirst({
      where: {
        tenantId: user.tenantId,
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

    const account = await prisma.financialAccount.create({
      data: {
        tenantId: user.tenantId,
        ownerUserId: user.id,
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

    return NextResponse.json(
      {
        id: account.id,
        name: account.name,
        type: account.type,
        usage: readAccountUsage(account),
        balance: Number(account.openingBalance),
        openingBalance: Number(account.openingBalance),
        currency: account.currency,
        color: account.color,
        institution: account.institution
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
      return NextResponse.json({ message: "Já existe uma conta com esse nome" }, { status: 409 });
    }

    captureRequestError(error, { request, feature: "accounts" });
    return NextResponse.json({ message: "Failed to create account" }, { status: 400 });
  }
}
