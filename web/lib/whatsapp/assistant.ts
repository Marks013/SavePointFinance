import { PaymentMethod, Prisma, Transaction, TransactionSource, TransactionType } from "@prisma/client";

import {
  getCardStatementSnapshot,
  getCurrentPayableStatementMonth,
} from "@/lib/cards/statement";
import { ensureTenantCardStatementSnapshots } from "@/lib/cards/snapshot-sync";
import { getAccountsWithComputedBalance } from "@/lib/finance/accounts";
import { BenefitWalletRuleError, validateBenefitWalletTransaction } from "@/lib/finance/benefit-wallet";
import { FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS } from "@/lib/finance/benefit-wallet-rules";
import { normalizeClassificationText } from "@/lib/finance/classification-normalization";
import { ensureFallbackCategory } from "@/lib/finance/default-categories";
import { getFinanceReport } from "@/lib/finance/reports";
import { resolveTransactionClassification } from "@/lib/finance/transaction-classification";
import { resolveTenantLicenseState } from "@/lib/licensing/policy";
import { getCurrentMonthKey } from "@/lib/month";
import { prisma } from "@/lib/prisma/client";
import { addMonthsClamped, formatCurrency, splitAmountIntoInstallments } from "@/lib/utils";
import { formatWhatsAppPhone, getWhatsAppPhoneLookupVariants } from "@/lib/whatsapp/phone";

type WhatsAppUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  whatsappNumber: string | null;
  isPlatformAdmin: boolean;
  isActive: boolean;
  tenant: {
    isActive: boolean;
    trialExpiresAt: Date | null;
    expiresAt: Date | null;
    planConfig: {
      id: string;
      name: string;
      slug: string;
      tier: "free" | "pro";
      maxAccounts: number | null;
      maxCards: number | null;
      whatsappAssistant: boolean;
      automation: boolean;
      pdfExport: boolean;
      trialDays: number;
      isActive: boolean;
    };
  };
};

type AssistantResult = {
  intent: string;
  status: string;
  response: string;
};

type IncomingTextMessage = {
  messageId?: string | null;
  phoneNumber: string;
  body: string;
};

const assistantEncodingFixes: Array<[string, string]> = [
  ["â˜€ï¸", "☀️"],
  ["ðŸŒ¤ï¸", "🌤️"],
  ["ðŸŒ™", "🌙"],
  ["ðŸ¤”", "🤔"],
  ["ðŸ”’", "🔒"],
  ["âš ï¸", "⚠️"],
  ["NÃ£o", "Não"],
  ["nÃ£o", "não"],
  ["nÃºmero", "número"],
  ["estÃ¡", "está"],
  ["vocÃª", "você"],
  ["licenÃ§a", "licença"],
  ["lanÃ§ar", "lançar"],
  ["relatÃ³rio", "relatório"],
  ["ConfiguraÃ§Ãµes", "Configurações"]
];

const regExpConstructor = RegExp as RegExpConstructor & {
  escape?: (value: string) => string;
};

const escapeRegExp =
  regExpConstructor.escape ??
  ((value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

export function sanitizeAssistantText(value: string) {
  return assistantEncodingFixes.reduce((current, [search, replacement]) => {
    return current.split(search).join(replacement);
  }, value);
}

function normalizeText(value: string) {
  return normalizeClassificationText(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  }).format(value);
}

function composeMessage(lines: Array<string | null | undefined | false>) {
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

function bold(value: string) {
  return `*${value}*`;
}

function formatColoredBalance(value: number) {
  return `${value < 0 ? "🔴" : "🔵"} ${formatCurrency(value)}`;
}

function getGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Sao_Paulo"
    }).format(new Date())
  );

  if (hour < 12) {
    return "☀️ Bom dia!";
  }

  if (hour < 18) {
    return "🌤️ Boa tarde!";
  }

  return "🌙 Boa noite!";
}

function withGreeting(lines: Array<string | null | undefined | false>) {
  return composeMessage([getGreeting(), "", ...lines]);
}

function parseCurrencyValue(text: string) {
  const match = text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2})|\d+(?:\.\d{2})?)/);
  if (!match) {
    return null;
  }

  const raw = match[1];
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const value = Number(normalized);

  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  return {
    value,
    raw
  };
}

function parseInstallments(text: string) {
  const match = text.match(/\b(\d{1,2})\s*(x|parcelas?)\b/i);
  if (!match) {
    return 1;
  }

  const installments = Number(match[1]);
  return Number.isFinite(installments) && installments >= 2 && installments <= 120 ? installments : 1;
}

function getPreviousMonthKey(baseMonthKey: string) {
  const [year, month] = baseMonthKey.split("-").map(Number);
  const date = new Date(year, (month ?? 1) - 2, 1, 12, 0, 0, 0);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, (month ?? 1) - 1, 1, 12, 0, 0, 0));
}

function inferPaymentMethod(text: string, hasCard: boolean): PaymentMethod {
  if (hasCard) {
    return "credit_card";
  }

  const normalized = normalizeText(text);

  if (/\bdinheiro\b/.test(normalized)) {
    return "money";
  }

  if (/\bdebito\b|\bdébito\b/.test(text)) {
    return "debit_card";
  }

  if (/\btransferencia\b|\btransferência\b|\bted\b|\bdoc\b/.test(text)) {
    return "transfer";
  }

  return "pix";
}

function capitalizeDescription(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function removeTrailingPaymentClause(value: string) {
  const paymentClausePatterns = [
    /\s+e\s+paguei\b.*$/i,
    /\s+e\s+usei\b.*$/i,
    /\s+e\s+foi\b.*$/i,
    /\s+paguei\b.*$/i,
    /\s+usei\b.*$/i,
    /\s+foi\s+(?:no|na|com|via|pelo|pela)\b.*$/i,
    /\s+(?:no|na|com|via|pelo|pela)\s+(?:pix|picpay|credito|crédito|debito|débito|cartao|cartão)\b.*$/i
  ];

  let current = value;

  for (const pattern of paymentClausePatterns) {
    current = current.replace(pattern, "");
  }

  return current;
}

function humanizeDescription(value: string) {
  let normalized = value.trim();

  if (!normalized) {
    return normalized;
  }

  normalized = normalized
    .replace(/^(?:usei)\s+(?:o|a)?\s*.+?\s+para\s+(.+)$/i, "$1")
    .replace(/^(?:foi)\s+(?:no|na|com|via|pelo|pela)\s+.+?\s+(.+)$/i, "$1")
    .replace(/\bfoi\b$/i, "")
    .trim();

  const humanizationRules: Array<[RegExp, string]> = [
    [/^(?:acabei de\s+)?compr(?:ei|ar)\s+(.+)$/i, "Compra de $1"],
    [/^(?:acabei de\s+)?gastei\s+(.+)$/i, "$1"],
    [/^(?:acabei de\s+)?pague(?:i|i a|i o)?\s+(.+)$/i, "Pagamento de $1"],
    [/^(?:acabei de\s+)?receb(?:i|er)\s+(.+)$/i, "Recebimento de $1"],
    [/^(?:acabei de\s+)?ganh(?:ei|ar)\s+(.+)$/i, "Recebimento de $1"],
    [/^(?:acabei de\s+)?assinei\s+(.+)$/i, "Assinatura de $1"]
  ];

  for (const [pattern, replacement] of humanizationRules) {
    if (pattern.test(normalized)) {
      return normalized.replace(pattern, replacement);
    }
  }

  return normalized
    .replace(/\bde a\b/gi, "da")
    .replace(/\bde o\b/gi, "do")
    .replace(/\bde as\b/gi, "das")
    .replace(/\bde os\b/gi, "dos")
    .trim();
}

export function stripDescriptionNoise(text: string, amountRaw: string, accountHints: string[], cardHints: string[]) {
  let description = text.trim();
  const escapedAmount = escapeRegExp(amountRaw);

  description = description.replace(/^(?:por favor\s+)?(?:acabei de\s+)?/i, "");
  description = description.replace(new RegExp(`(?:r\\$\\s*)?${escapedAmount}`, "i"), "");
  description = description.replace(/\br\$\b/gi, "");
  description = description.replace(/\b(?:real|reais)\b/gi, "");
  description = description.replace(/\b(\d{1,2})\s*(x|parcelas?)\b/gi, "");
  description = description.replace(/\b(?:hoje|agora|mesmo|mesma)\b/gi, "");

  for (const hint of [...accountHints, ...cardHints]) {
    if (!hint) {
      continue;
    }

    const escaped = escapeRegExp(hint);
    description = description.replace(new RegExp(`\\b(?:na|no|em)\\s+${escaped}\\b`, "i"), "");
    description = description.replace(new RegExp(`\\b${escaped}\\b`, "i"), "");
  }

  description = description
    .replace(/\b(?:usei|foi)\s+(?:o|a)?\s*(?:pix|picpay|credito|crédito|debito|débito|cartao|cartão)\b/gi, "")
    .replace(/\b(?:pix|picpay|credito|crédito|debito|débito|cartao|cartão)\b/gi, "")
    .replace(/\b(?:com|no|na|em|via|pelo|pela)\b\s*$/i, "")
    .replace(/\be\s*$/i, "")
    .replace(/\s+[,:;.-]\s*/g, " ")
    .replace(/[,:;.-]+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .trim();

  description = removeTrailingPaymentClause(description)
    .replace(/\b(?:se)\s+comprar\b/i, "comprar")
    .replace(/\b(?:pro|pra)\b/gi, "para")
    .replace(/\bfoi\b$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  description = humanizeDescription(description)
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .trim();

  return capitalizeDescription(description || "Lançamento via WhatsApp");
}

function scoreAliasMatch(text: string, aliases: string[]) {
  const normalized = normalizeText(text);
  let score = 0;

  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) {
      continue;
    }

    if (normalized === normalizedAlias) {
      score = Math.max(score, 10);
      continue;
    }

    if (normalized.includes(normalizedAlias)) {
      score = Math.max(score, normalizedAlias.includes(" ") ? 8 : 6);
    }
  }

  return score;
}

async function findUserByPhoneNumber(phoneNumber: string) {
  const values = getWhatsAppPhoneLookupVariants(phoneNumber);

  if (!values.length) {
    return null;
  }

  return prisma.user.findFirst({
    where: {
      whatsappNumber: {
        in: values
      }
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      name: true,
      whatsappNumber: true,
      isPlatformAdmin: true,
      isActive: true,
      tenant: {
        select: {
          isActive: true,
          trialExpiresAt: true,
          expiresAt: true,
          planConfig: {
            select: {
              id: true,
              name: true,
              slug: true,
              tier: true,
              maxAccounts: true,
              maxCards: true,
              whatsappAssistant: true,
              automation: true,
              pdfExport: true,
              trialDays: true,
              isActive: true
            }
          }
        }
      }
    }
  });
}

async function createExpenseOrIncomeFromText(user: WhatsAppUser, body: string, type: "income" | "expense") {
  const amountData = parseCurrencyValue(body);

  if (!amountData) {
    return {
      intent: type === "income" ? "launch_income" : "launch_expense",
      status: "needs_amount",
      response:
        type === "income"
          ? "🟡 Não encontrei o valor da entrada.\n\nExemplo:\n`recebi 3200 salário no Itaú`"
          : "🟡 Não encontrei o valor da despesa.\n\nExemplo:\n`gastei 42,50 mercado na Nubank`"
    } satisfies AssistantResult;
  }

  const [accounts, cards] = await Promise.all([
    getAccountsWithComputedBalance(user.tenantId),
    prisma.card.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true
      },
      orderBy: {
        name: "asc"
      }
    })
  ]);
  const activeAccounts = accounts.filter((item) => item.isActive);

  const matchedCard =
    cards
      .map((card) => ({
        card,
        score: scoreAliasMatch(body, [card.name, card.brand, card.institution ?? "", card.last4 ?? ""])
      }))
      .sort((a, b) => b.score - a.score)[0] ?? null;
  const matchedAccount =
    activeAccounts
      .map((account) => ({
        account,
        score: scoreAliasMatch(body, [account.name, account.institution ?? "", account.type])
      }))
      .sort((a, b) => b.score - a.score)[0] ?? null;

  const card = matchedCard?.score > 0 ? matchedCard.card : null;
  const account =
    !card && matchedAccount?.score > 0
      ? matchedAccount.account
      : !card && activeAccounts.length === 1
        ? activeAccounts[0]
        : null;
  const mentionsCard =
    /\bcartao\b|\bcartão\b|\bcredito\b|\bcrédito\b|\bvisa\b|\bmastercard\b|\belo\b/i.test(body) ||
    Boolean(card);

  if (type === "income" && mentionsCard) {
    return {
      intent: "launch_income",
      status: "unsupported_target",
      response: "⚠️ Entradas pelo WhatsApp precisam ser vinculadas a uma conta, não a um cartão."
    } satisfies AssistantResult;
  }

  if (type === "expense" && mentionsCard && !card && cards.length !== 1) {
    return {
      intent: "launch_expense",
      status: "needs_card",
      response: "🟡 Me diga qual cartão usar.\n\nExemplo:\n`gastei 120 farmácia no Nubank Visa`"
    } satisfies AssistantResult;
  }

  const selectedCard = card ?? (type === "expense" && mentionsCard && cards.length === 1 ? cards[0] : null);

  if (!selectedCard && !account) {
    return {
      intent: type === "income" ? "launch_income" : "launch_expense",
      status: "needs_account",
      response:
        accounts.length > 1
          ? "🟡 Me diga em qual conta lançar.\n\nExemplo:\n`recebi 3200 salário no Itaú`"
          : "⚠️ Você precisa ter ao menos uma conta ativa para usar o assistente no WhatsApp."
    } satisfies AssistantResult;
  }

  const paymentMethod = inferPaymentMethod(body, Boolean(selectedCard));
  const installments = selectedCard ? parseInstallments(body) : 1;
  const description = stripDescriptionNoise(
    body,
    amountData.raw,
    account ? [account.name, account.institution ?? ""] : [],
    selectedCard ? [selectedCard.name, selectedCard.brand, selectedCard.institution ?? ""] : []
  );

  const classification = await resolveTransactionClassification({
    tenantId: user.tenantId,
    type,
    description,
    notes: null,
    paymentMethod,
    allowedCategorySystemKeys:
      type === "expense" && account?.usage === "benefit_food"
        ? FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS
        : undefined
  });

  const installmentAmounts = splitAmountIntoInstallments(amountData.value, installments);
  const resolvedCategoryId =
    classification.categoryId ||
    (type === "expense" && account?.usage === "benefit_food"
      ? null
      : await ensureFallbackCategory(user.tenantId, type));
  const resolvedCategory = resolvedCategoryId
    ? await prisma.category.findFirst({
        where: {
          tenantId: user.tenantId,
          id: resolvedCategoryId
        },
        select: {
          name: true,
          monthlyLimit: true
        }
      })
    : null;

  try {
    await validateBenefitWalletTransaction({
      tenantId: user.tenantId,
      type,
      paymentMethod,
      accountId: selectedCard ? null : account?.id ?? null,
      destinationAccountId: null,
      categoryId: resolvedCategoryId,
      cardId: selectedCard?.id ?? null
    });
  } catch (error) {
    if (error instanceof BenefitWalletRuleError) {
      return {
        intent: type === "income" ? "launch_income" : "launch_expense",
        status: "benefit_wallet_rule",
        response: `⚠️ ${error.message}`
      } satisfies AssistantResult;
    }

    throw error;
  }

  let parentId: string | null = null;

  for (let index = 0; index < installments; index += 1) {
    const created: Transaction = await prisma.transaction.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        date: addMonthsClamped(new Date(), index),
        amount: new Prisma.Decimal(installmentAmounts[index].toFixed(2)),
        description:
          installments > 1 ? `${description} (${index + 1}/${installments})` : description,
        type: type === "income" ? TransactionType.income : TransactionType.expense,
        source: TransactionSource.whatsapp,
        paymentMethod,
        categoryId: resolvedCategoryId,
        accountId: selectedCard ? null : account?.id ?? null,
        cardId: selectedCard?.id ?? null,
        installmentsTotal: installments,
        installmentNumber: index + 1,
        parentId,
        classificationSource: classification.classificationSource,
        classificationKeyword: classification.classificationKeyword,
        classificationReason: classification.reason,
        classificationVersion: 2,
        aiClassified: classification.aiClassified,
        aiConfidence:
          classification.confidence !== null ? new Prisma.Decimal(classification.confidence.toFixed(2)) : null
      }
    });

    if (index === 0) {
      parentId = created.id;
    }
  }

  const targetLabel = selectedCard
    ? `cartão ${selectedCard.name}`
    : `conta ${account?.name ?? "informada"}`;
  const category = resolvedCategory?.name ?? "Outros";
  let alertSuffix = "";

  if (type === "expense" && resolvedCategoryId) {
    const currentMonthKey = getCurrentMonthKey();
    const previousMonthKey = getPreviousMonthKey(currentMonthKey);
    const [currentMonthReport, previousMonthReport] = await Promise.all([
      getFinanceReport(user.tenantId, { month: currentMonthKey }),
      getFinanceReport(user.tenantId, { month: previousMonthKey })
    ]);
    const currentCategory = currentMonthReport.byCategory.find((item) => item.id === resolvedCategoryId) ?? null;
    const previousCategory = previousMonthReport.byCategory.find((item) => item.id === resolvedCategoryId) ?? null;
    const currentTotal = currentCategory?.total ?? 0;
    const previousTotal = previousCategory?.total ?? 0;
    const limitAmount = Number(resolvedCategory?.monthlyLimit ?? 0);

    if (limitAmount > 0 && currentTotal >= limitAmount) {
      alertSuffix =
        `🚨 Alerta SavePoint: ${category} já está em ${formatCurrency(currentTotal)} no mês e passou do limite de ` +
        `${formatCurrency(limitAmount)}.`;
    } else if (limitAmount > 0 && currentTotal >= limitAmount * 0.8) {
      alertSuffix =
        `⚠️ Alerta SavePoint: ${category} já consumiu ${Math.round((currentTotal / limitAmount) * 100)}% ` +
        `do limite mensal (${formatCurrency(currentTotal)} de ${formatCurrency(limitAmount)}).`;
    } else if (previousTotal > 0 && currentTotal >= previousTotal * 1.5 && currentTotal - previousTotal >= 100) {
      alertSuffix =
        `📈 Alerta SavePoint: ${category} acelerou forte neste mês, com ${formatCurrency(currentTotal)} ` +
        `contra ${formatCurrency(previousTotal)} no mês anterior.`;
    }
  }

  return {
    intent: type === "income" ? "launch_income" : "launch_expense",
    status: "created",
    response: withGreeting([
      type === "income" ? "✅ Entrada registrada com sucesso" : "✅ Despesa registrada com sucesso",
      `💰 Valor: ${formatCurrency(amountData.value)}`,
      selectedCard ? `💳 Destino: ${targetLabel}` : `🏦 Destino: ${targetLabel}`,
      `🏷️ Categoria: ${bold(category)}`,
      installments > 1 ? `🧾 Parcelamento: ${installments}x` : null,
      alertSuffix ? `\n${alertSuffix}` : null
    ])
  } satisfies AssistantResult;
}

async function replyWithBalance(user: WhatsAppUser, body: string) {
  const accounts = (await getAccountsWithComputedBalance(user.tenantId)).filter((item) => item.isActive);

  if (!accounts.length) {
    return {
      intent: "balance",
      status: "no_accounts",
      response: "⚠️ Não encontrei contas ativas nesta carteira compartilhada."
    } satisfies AssistantResult;
  }

  const match =
    accounts
      .map((account) => ({
        account,
        score: scoreAliasMatch(body, [account.name, account.institution ?? "", account.type])
      }))
      .sort((a, b) => b.score - a.score)[0] ?? null;

  if (match?.score > 0) {
    return {
      intent: "balance",
      status: "ok",
      response: withGreeting([
        `💰 Saldo da conta ${bold(match.account.name)}`,
        `• Atual: ${formatColoredBalance(match.account.currentBalance)}`
      ])
    } satisfies AssistantResult;
  }

  const total = accounts.reduce((sum, item) => sum + item.currentBalance, 0);
  const preview = accounts
    .slice(0, 3)
    .map((item) => `• ${bold(item.name)}: ${formatColoredBalance(item.currentBalance)}`)
    .join("\n");

  return {
    intent: "balance",
    status: "ok",
    response: withGreeting([
      "💼 Visão consolidada do seu caixa",
      `• Total: ${formatColoredBalance(total)}`,
      preview
    ])
  } satisfies AssistantResult;
}

async function replyWithCardInfo(user: WhatsAppUser, body: string) {
  await ensureTenantCardStatementSnapshots(user.tenantId);
  const cards = await prisma.card.findMany({
    where: {
      tenantId: user.tenantId,
      isActive: true
    },
    orderBy: {
      name: "asc"
    }
  });

  if (!cards.length) {
    return {
      intent: "card_info",
      status: "no_cards",
      response: "⚠️ Não encontrei cartões ativos nesta carteira compartilhada."
    } satisfies AssistantResult;
  }

  const match =
    cards
      .map((card) => ({
        card,
        score: scoreAliasMatch(body, [card.name, card.brand, card.institution ?? "", card.last4 ?? ""])
      }))
      .sort((a, b) => b.score - a.score)[0] ?? null;
  const card = match?.score > 0 ? match.card : cards.length === 1 ? cards[0] : null;

  if (!card) {
    return {
      intent: "card_info",
      status: "needs_card",
      response: "🟡 Me diga qual cartão você quer consultar.\n\nExemplo:\n`fatura Nubank Visa` ou `limite Mastercard`"
    } satisfies AssistantResult;
  }

  const month = getCurrentPayableStatementMonth(card, new Date());
  const statement = await getCardStatementSnapshot({
    tenantId: user.tenantId,
    card,
    month,
    client: prisma
  });

  return {
    intent: "card_info",
    status: "ok",
    response: withGreeting([
      `💳 Cartão ${bold(card.name)}`,
      `• Fatura atual: ${formatCurrency(statement.totalAmount)}`,
      `• Limite disponível: ${formatCurrency(statement.availableLimit)} de ${formatCurrency(Number(card.limitAmount))}`,
      `• Fecha em: ${formatDate(statement.closeDate)}`,
      `• Vence em: ${formatDate(statement.dueDate)}`
    ])
  } satisfies AssistantResult;
}

async function replyWithCardInstallments(user: WhatsAppUser, body: string) {
  const cards = await prisma.card.findMany({
    where: {
      tenantId: user.tenantId,
      isActive: true
    },
    orderBy: {
      name: "asc"
    }
  });

  if (!cards.length) {
    return {
      intent: "card_installments",
      status: "no_cards",
      response: "⚠️ Não encontrei cartões ativos nesta carteira compartilhada."
    } satisfies AssistantResult;
  }

  const match =
    cards
      .map((card) => ({
        card,
        score: scoreAliasMatch(body, [card.name, card.brand, card.institution ?? "", card.last4 ?? ""])
      }))
      .sort((a, b) => b.score - a.score)[0] ?? null;
  const card = match?.score > 0 ? match.card : cards.length === 1 ? cards[0] : null;

  if (!card) {
    return {
      intent: "card_installments",
      status: "needs_card",
      response: "🟡 Me diga qual cartão você quer consultar.\n\nExemplo:\n`quais parcelados no PicPay`"
    } satisfies AssistantResult;
  }

  const roots = await prisma.transaction.findMany({
    where: {
      tenantId: user.tenantId,
      cardId: card.id,
      parentId: null,
      installmentsTotal: {
        gt: 1
      }
    },
    include: {
      category: {
        select: {
          name: true
        }
      }
    },
    orderBy: {
      date: "desc"
    },
    take: 8
  });

  if (!roots.length) {
    return {
      intent: "card_installments",
      status: "no_installments",
      response: withGreeting([
        `💳 Cartão ${bold(card.name)}`,
        "✅ Não encontrei compras parceladas registradas nesse cartão."
      ])
    } satisfies AssistantResult;
  }

  const groups = await Promise.all(
    roots.map(async (root) => {
      const installments = await prisma.transaction.findMany({
        where: {
          tenantId: user.tenantId,
          OR: [{ id: root.id }, { parentId: root.id }]
        },
        orderBy: {
          installmentNumber: "asc"
        }
      });

      const settledInstallments = installments.filter((item) => item.settledAt).length;
      const nextInstallment = installments.find((item) => !item.settledAt) ?? null;

      return {
        description: root.description.replace(/\s\(\d+\/\d+\)$/, ""),
        categoryName: root.category?.name ?? "Outros",
        installmentAmount: installments[0] ? Number(installments[0].amount) : 0,
        totalAmount: installments.reduce((sum, item) => sum + Number(item.amount), 0),
        installmentsTotal: root.installmentsTotal,
        settledInstallments,
        remainingInstallments: Math.max(root.installmentsTotal - settledInstallments, 0),
        nextInstallmentDate: nextInstallment?.date ?? null
      };
    })
  );

  const lines = groups.slice(0, 5).map((group) =>
    composeMessage([
      `• ${bold(group.description)}`,
      `  🏷️ ${bold(group.categoryName)} | 💸 ${formatCurrency(group.installmentAmount)} por parcela`,
      `  📦 ${group.settledInstallments}/${group.installmentsTotal} pagas | ${group.remainingInstallments} restantes`,
      group.nextInstallmentDate ? `  📅 Próxima: ${formatDate(group.nextInstallmentDate)}` : null
    ])
  );

  return {
    intent: "card_installments",
    status: "ok",
    response: withGreeting([
      `💳 Parcelados do cartão ${bold(card.name)}`,
      `• Compras parceladas encontradas: ${groups.length}`,
      `• Valor total em parcelados: ${formatCurrency(groups.reduce((sum, item) => sum + item.totalAmount, 0))}`,
      "",
      ...lines
    ])
  } satisfies AssistantResult;
}

async function replyWithFinanceReport(user: WhatsAppUser, body: string) {
  const normalized = normalizeText(body);
  const requestedMonth =
    /\b(mes passado|mês passado|ultimo mes|último mês|anterior)\b/.test(normalized)
      ? getPreviousMonthKey(getCurrentMonthKey())
      : getCurrentMonthKey();
  const report = await getFinanceReport(user.tenantId, {
    month: requestedMonth
  });
  const topCategory = report.spendingInsights.topCategory;
  const categoryPreview = report.byCategory
    .slice(0, 3)
    .map((item) => `• ${bold(item.name)}: ${formatCurrency(item.total)}`)
    .join("\n");
  const alerts = report.annualInsights.alerts.slice(0, 2).join(" ");

  return {
    intent: "finance_report",
    status: "ok",
    response: withGreeting([
      `📊 Relatório SavePoint de ${bold(getMonthLabel(requestedMonth))}`,
      `• Receitas: ${formatCurrency(report.summary.income)}`,
      `• Despesas: ${formatCurrency(report.summary.expense)}`,
      `• Saldo: ${formatColoredBalance(report.summary.balance)}`,
      topCategory ? `🏷️ Categoria mais pesada: ${bold(topCategory.name)} com ${formatCurrency(topCategory.total)}` : null,
      categoryPreview ? `\n📌 Destaques por categoria\n${categoryPreview}` : null,
      alerts ? `\n⚠️ Alertas\n${alerts}` : null
    ])
  } satisfies AssistantResult;
}

async function replyWithLastExpense(user: WhatsAppUser) {
  const lastExpense = await prisma.transaction.findFirst({
    where: {
      tenantId: user.tenantId,
      type: "expense",
      date: {
        lte: new Date()
      }
    },
    select: {
      description: true,
      amount: true,
      date: true,
      category: {
        select: {
          name: true
        }
      },
      financialAccount: {
        select: {
          name: true
        }
      },
      card: {
        select: {
          name: true
        }
      }
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }]
  });

  if (!lastExpense) {
    return {
      intent: "last_expense",
      status: "no_expenses",
      response: withGreeting(["⚠️ Ainda não encontrei despesas registradas nessa carteira."])
    } satisfies AssistantResult;
  }

  return {
    intent: "last_expense",
    status: "ok",
    response: withGreeting([
      "🧾 Seu último gasto registrado",
      `• ${bold(lastExpense.description)}`,
      `• Valor: ${formatCurrency(Number(lastExpense.amount))}`,
      `• Data: ${formatDate(lastExpense.date)}`,
      `• Categoria: ${bold(lastExpense.category?.name ?? "Sem categoria")}`,
      `• Origem: ${lastExpense.financialAccount?.name ?? lastExpense.card?.name ?? "Sem origem"}`
    ])
  } satisfies AssistantResult;
}

function isGreeting(normalized: string) {
  return /^(ajuda|menu|help|oi|ola|olá)\b/.test(normalized);
}

function isCardIntent(normalized: string) {
  return /\b(fatura|limite|cartao|cartão)\b/.test(normalized);
}

function isInstallmentsIntent(normalized: string) {
  return /\b(parcelad\w*|parcela\w*)\b/.test(normalized);
}

function isBalanceIntent(normalized: string) {
  return /\b(saldo|conta|contas|quanto tenho|como esta meu saldo|como está meu saldo)\b/.test(normalized);
}

function isReportIntent(normalized: string) {
  return /\b(relatorio|relatório|resumo|fechamento|como estou|visao do mes|visão do mês|gastos do mes|gastos do mês|maiores categorias|categoria .*gastei mais|gastei mais .*mes|gastei mais .*mês|maior gasto .*mes|maior gasto .*mês|onde gastei mais)\b/.test(
    normalized
  );
}

function isLastExpenseIntent(normalized: string) {
  return /\b(ultimo gasto|último gasto|ultima despesa|última despesa|meu ultimo gasto|minha ultima despesa|qual foi meu ultimo gasto|qual foi minha ultima despesa)\b/.test(
    normalized
  );
}

function isExpenseIntent(normalized: string) {
  return /\b(gastei|paguei|comprei|gasto|despesa|debita|débita|lanca despesa|lança despesa|registra despesa|anota despesa)\b/.test(
    normalized
  );
}

function isIncomeIntent(normalized: string) {
  return /\b(recebi|ganhei|entrou|entrada|receita|credito|crédito|lanca receita|lança receita|registra receita|anota receita)\b/.test(
    normalized
  );
}

function isLaunchIntent(normalized: string) {
  return /\b(lanca|lança|registra|registre|anota|adicione|adiciona|cadastra|cadastre)\b/.test(normalized);
}

function buildHelpResponse() {
  return (
    "Sou o assistente financeiro do SavePoint no WhatsApp.\n" +
    "Posso lançar receitas e despesas, consultar saldo e cartões, resumir o mês e alertar quando uma categoria estiver pesando.\n" +
    "\n✨ Exemplos:\n" +
    "• gastei 42,50 mercado na Nubank\n" +
    "• lança 120 de farmácia no cartão Visa 3x\n" +
    "• recebi 3200 salario no Itau\n" +
    "• me mostra meu saldo\n" +
    "• resumo do mês\n" +
    "• relatorio do mes passado\n" +
    "• fatura Visa"
  );
}

async function handleAssistantCommand(user: WhatsAppUser, body: string) {
  const normalized = normalizeText(body);

  if (!normalized) {
    return {
      intent: "empty",
      status: "ignored",
      response: withGreeting([buildHelpResponse()])
    } satisfies AssistantResult;
  }

  if (isGreeting(normalized)) {
    return {
      intent: "help",
      status: "ok",
      response: withGreeting([buildHelpResponse()])
    } satisfies AssistantResult;
  }

  if (isReportIntent(normalized)) {
    return replyWithFinanceReport(user, body);
  }

  if (isLastExpenseIntent(normalized)) {
    return replyWithLastExpense(user);
  }

  if (isLaunchIntent(normalized) && isIncomeIntent(normalized)) {
    return createExpenseOrIncomeFromText(user, body, "income");
  }

  if (isLaunchIntent(normalized) && (isExpenseIntent(normalized) || Boolean(parseCurrencyValue(body)))) {
    return createExpenseOrIncomeFromText(user, body, "expense");
  }

  if (isExpenseIntent(normalized)) {
    return createExpenseOrIncomeFromText(user, body, "expense");
  }

  if (isIncomeIntent(normalized)) {
    return createExpenseOrIncomeFromText(user, body, "income");
  }

  if (isInstallmentsIntent(normalized)) {
    return replyWithCardInstallments(user, body);
  }

  if (isCardIntent(normalized)) {
    return replyWithCardInfo(user, body);
  }

  if (isBalanceIntent(normalized)) {
    return replyWithBalance(user, body);
  }

  return {
    intent: "fallback",
    status: "unknown_command",
    response: withGreeting([
      "🤔 Não entendi esse pedido ainda.",
      "Me chama com `ajuda` que eu te mostro jeitos de lançar, consultar saldo, ver fatura e pedir relatório."
    ])
  } satisfies AssistantResult;
}

export async function processIncomingWhatsAppTextMessage(message: IncomingTextMessage) {
  const formattedPhone = formatWhatsAppPhone(message.phoneNumber) ?? message.phoneNumber;
  const user = await findUserByPhoneNumber(formattedPhone);

  if (!user || !user.isActive) {
    return {
      handled: true,
      to: formattedPhone,
      response:
        "⚠️ Seu número ainda não está vinculado a uma pessoa ativa no Save Point.\n\n" +
        "Abra Configurações no app e atualize o WhatsApp cadastrado."
    };
  }

  const license = resolveTenantLicenseState(user.tenant);

  if (!user.isPlatformAdmin && !license.canAccessApp) {
    return {
      handled: true,
      to: formattedPhone,
      response: "⚠️ A conta vinculada a você está com a licença indisponível no momento."
    };
  }

  if (!user.isPlatformAdmin && !license.features.whatsappAssistant) {
    return {
      handled: true,
      to: formattedPhone,
      response: "🔒 O assistente no WhatsApp está disponível apenas no plano Premium."
    };
  }

  await prisma.whatsAppMessage.create({
    data: {
      tenantId: user.tenantId,
      userId: user.id,
      phoneNumber: formattedPhone,
      direction: "inbound",
      messageId: message.messageId ?? null,
      body: message.body,
      status: "received"
    }
  });

  const result = await handleAssistantCommand(user, message.body);

  return {
    handled: true,
    to: formattedPhone,
    response: result.response,
    logContext: {
      tenantId: user.tenantId,
      userId: user.id,
      phoneNumber: formattedPhone,
      intent: result.intent,
      status: result.status
    }
  };
}
