import { isAllowedBenefitFoodCategory } from "@/lib/finance/benefit-wallet-rules";
import { prisma } from "@/lib/prisma/client";

const BENEFIT_FOOD_USAGE = "benefit_food";
const STANDARD_USAGE = "standard";

type BenefitWalletValidationInput = {
  tenantId: string;
  type: "income" | "expense" | "transfer";
  paymentMethod: "pix" | "money" | "credit_card" | "debit_card" | "transfer";
  accountId?: string | null;
  destinationAccountId?: string | null;
  categoryId?: string | null;
  cardId?: string | null;
};

export class BenefitWalletRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenefitWalletRuleError";
  }
}

export async function validateBenefitWalletTransaction(input: BenefitWalletValidationInput) {
  const [account, destinationAccount, category] = await Promise.all([
    input.accountId
      ? prisma.financialAccount.findFirst({
          where: { id: input.accountId, tenantId: input.tenantId },
          select: { id: true, usage: true, name: true }
        })
      : null,
    input.destinationAccountId
      ? prisma.financialAccount.findFirst({
          where: { id: input.destinationAccountId, tenantId: input.tenantId },
          select: { id: true, usage: true, name: true }
        })
      : null,
    input.categoryId
      ? prisma.category.findFirst({
          where: { id: input.categoryId, tenantId: input.tenantId },
          select: { id: true, type: true, systemKey: true, name: true }
        })
      : null
  ]);

  const usesBenefitWallet =
    account?.usage === BENEFIT_FOOD_USAGE ||
    destinationAccount?.usage === BENEFIT_FOOD_USAGE;

  if (!usesBenefitWallet) {
    return {
      accountUsage: account?.usage ?? STANDARD_USAGE,
      destinationAccountUsage: destinationAccount?.usage ?? STANDARD_USAGE,
      usesBenefitWallet: false
    };
  }

  if (input.type === "transfer") {
    throw new BenefitWalletRuleError(
      "Vale Alimentacao nao pode ser movimentado por transferencia entre contas."
    );
  }

  if (input.destinationAccountId) {
    throw new BenefitWalletRuleError(
      "Vale Alimentacao nao pode definir conta de destino."
    );
  }

  if (input.paymentMethod === "credit_card" || input.cardId) {
    throw new BenefitWalletRuleError(
      "Vale Alimentacao nao pode usar cartao de credito."
    );
  }

  if (!account || account.usage !== BENEFIT_FOOD_USAGE) {
    throw new BenefitWalletRuleError(
      "Lancamentos com Vale Alimentacao devem sair da carteira de beneficio."
    );
  }

  if (input.type === "expense") {
    if (!category) {
      throw new BenefitWalletRuleError(
        "Consumos de Vale Alimentacao exigem categoria permitida."
      );
    }

    if (category.type !== "expense" || !isAllowedBenefitFoodCategory(category.systemKey)) {
      throw new BenefitWalletRuleError(
        "Vale Alimentacao so pode ser usado em categorias de alimentacao permitidas."
      );
    }
  }

  return {
    accountUsage: account.usage,
    destinationAccountUsage: destinationAccount?.usage ?? STANDARD_USAGE,
    usesBenefitWallet: true,
    eligibleCategoryName: category?.name ?? null
  };
}

export function isBenefitFoodUsage(value: string | null | undefined) {
  return value === BENEFIT_FOOD_USAGE;
}
