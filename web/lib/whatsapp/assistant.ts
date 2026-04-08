import { PaymentMethod, Prisma, Transaction, TransactionSource, TransactionType } from "@prisma/client";

import {
  getCardStatementSnapshot,
  getCurrentStatementMonth,
  getStatementCloseDate,
  getStatementPaymentDate
} from "@/lib/cards/statement";
import { classifyTransactionCategory } from "@/lib/finance/category-classifier";
import { getAccountsWithComputedBalance } from "@/lib/finance/accounts";
import { ensureFallbackCategory } from "@/lib/finance/default-categories";
import { resolveTenantLicenseState } from "@/lib/licensing/policy";
import { prisma } from "@/lib/prisma/client";
import { addMonthsClamped, formatCurrency, splitAmountIntoInstallments } from "@/lib/utils";
import { formatWhatsAppPhone, normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";

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

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  }).format(value);
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

function stripDescriptionNoise(text: string, amountRaw: string, accountHints: string[], cardHints: string[]) {
  let description = text.trim();

  description = description.replace(/^(gastei|paguei|comprei|recebi|ganhei|entrou)\s+/i, "");
  description = description.replace(amountRaw, "");
  description = description.replace(/\b(\d{1,2})\s*(x|parcelas?)\b/gi, "");

  for (const hint of [...accountHints, ...cardHints]) {
    if (!hint) {
      continue;
    }

    const escaped = hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    description = description.replace(new RegExp(`\\b(?:na|no|em)\\s+${escaped}\\b`, "i"), "");
    description = description.replace(new RegExp(`\\b${escaped}\\b`, "i"), "");
  }

  description = description
    .replace(/\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .trim();

  return description || "Lançamento via WhatsApp";
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
  const normalized = normalizeWhatsAppPhone(phoneNumber);
  const formatted = formatWhatsAppPhone(phoneNumber);
  const values = Array.from(new Set([normalized, formatted].filter(Boolean))) as string[];

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
          ? "Não encontrei o valor da entrada. Exemplo: recebi 3200 salário no Itaú."
          : "Não encontrei o valor da despesa. Exemplo: gastei 42,50 mercado na Nubank."
    } satisfies AssistantResult;
  }

  const [accounts, cards, categories, history] = await Promise.all([
    getAccountsWithComputedBalance(user.tenantId),
    prisma.card.findMany({
      where: {
        tenantId: user.tenantId,
        isActive: true
      },
      orderBy: {
        name: "asc"
      }
    }),
    prisma.category.findMany({
      where: {
        tenantId: user.tenantId
      },
      select: {
        id: true,
        name: true,
        type: true,
        keywords: true
      }
    }),
    prisma.transaction.findMany({
      where: {
        tenantId: user.tenantId,
        type,
        categoryId: {
          not: null
        }
      },
      select: {
        categoryId: true,
        description: true,
        notes: true,
        aiClassified: true,
        aiConfidence: true
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 250
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
      response: "Entradas pelo WhatsApp precisam ser vinculadas a uma conta, não a um cartão."
    } satisfies AssistantResult;
  }

  if (type === "expense" && mentionsCard && !card && cards.length !== 1) {
    return {
      intent: "launch_expense",
      status: "needs_card",
      response: "Informe qual cartão usar. Exemplo: gastei 120 farmácia no Nubank Visa."
    } satisfies AssistantResult;
  }

  const selectedCard = card ?? (type === "expense" && mentionsCard && cards.length === 1 ? cards[0] : null);

  if (!selectedCard && !account) {
    return {
      intent: type === "income" ? "launch_income" : "launch_expense",
      status: "needs_account",
      response:
        accounts.length > 1
          ? "Informe a conta do lançamento. Exemplo: recebi 3200 salário no Itaú."
          : "Cadastre ao menos uma conta ativa para usar o assistente no WhatsApp."
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

  const classification = await classifyTransactionCategory({
    type,
    description,
    notes: null,
    paymentMethod,
    categories,
    history: history
      .filter((item): item is typeof item & { categoryId: string } => Boolean(item.categoryId))
      .map((item) => ({
        categoryId: item.categoryId,
        description: item.description,
        notes: item.notes,
        aiClassified: item.aiClassified,
        aiConfidence: item.aiConfidence ? Number(item.aiConfidence) : null
      }))
  });

  const installmentAmounts = splitAmountIntoInstallments(amountData.value, installments);
  const resolvedCategoryId = classification.categoryId || (await ensureFallbackCategory(user.tenantId, type));
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
  const category = classification.categoryId
    ? categories.find((item) => item.id === classification.categoryId)?.name ?? "Categoria sugerida"
    : categories.find((item) => item.id === resolvedCategoryId)?.name ?? "Outros";

  return {
    intent: type === "income" ? "launch_income" : "launch_expense",
    status: "created",
    response:
      `${type === "income" ? "Entrada registrada" : "Despesa registrada"}: ${formatCurrency(amountData.value)} em ${targetLabel}. ` +
      `Categoria: ${category}.` +
      (installments > 1 ? ` Parcelado em ${installments}x.` : "")
  } satisfies AssistantResult;
}

async function replyWithBalance(user: WhatsAppUser, body: string) {
  const accounts = (await getAccountsWithComputedBalance(user.tenantId)).filter((item) => item.isActive);

  if (!accounts.length) {
    return {
      intent: "balance",
      status: "no_accounts",
      response: "Não encontrei contas ativas nesta carteira compartilhada."
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
      response: `Saldo atual da conta ${match.account.name}: ${formatCurrency(match.account.currentBalance)}.`
    } satisfies AssistantResult;
  }

  const total = accounts.reduce((sum, item) => sum + item.currentBalance, 0);
  const preview = accounts
    .slice(0, 3)
    .map((item) => `${item.name}: ${formatCurrency(item.currentBalance)}`)
    .join(" | ");

  return {
    intent: "balance",
    status: "ok",
    response: `Saldo consolidado: ${formatCurrency(total)}. ${preview}`
  } satisfies AssistantResult;
}

async function replyWithCardInfo(user: WhatsAppUser, body: string) {
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
      response: "Não encontrei cartões ativos nesta carteira compartilhada."
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
      response: "Informe qual cartão consultar. Exemplo: fatura Nubank Visa ou limite Mastercard."
    } satisfies AssistantResult;
  }

  const month = getCurrentStatementMonth(card, new Date());
  const statement = await getCardStatementSnapshot({
    tenantId: user.tenantId,
    card,
    month,
    client: prisma
  });
  const statementAmount = statement.totalAmount;
  const availableLimit = statement.availableLimit;

  return {
    intent: "card_info",
    status: "ok",
    response:
      `Cartão ${card.name}. Fatura atual: ${formatCurrency(statementAmount)}. ` +
      `Saldo em aberto: ${formatCurrency(statement.outstandingAmount)}. ` +
      `Limite disponível: ${formatCurrency(availableLimit)} de ${formatCurrency(Number(card.limitAmount))}. ` +
      `Fecha em ${formatDate(getStatementCloseDate(month, card.closeDay, card.dueDay))} e vence em ${formatDate(
        getStatementPaymentDate(month, card.dueDay)
      )}.`
  } satisfies AssistantResult;
}

function buildHelpResponse() {
  return (
    "Comandos do assistente:\n" +
    "- gastei 42,50 mercado na Nubank\n" +
    "- gastei 320 farmácia no cartão Visa 3x\n" +
    "- recebi 3200 salario no Itau\n" +
    "- saldo\n" +
    "- saldo Nubank\n" +
    "- fatura Visa\n" +
    "- limite Mastercard"
  );
}

async function handleAssistantCommand(user: WhatsAppUser, body: string) {
  const normalized = normalizeText(body);

  if (!normalized) {
    return {
      intent: "empty",
      status: "ignored",
      response: buildHelpResponse()
    } satisfies AssistantResult;
  }

  if (/^(ajuda|menu|help|oi|ola|olá)\b/.test(normalized)) {
    return {
      intent: "help",
      status: "ok",
      response: buildHelpResponse()
    } satisfies AssistantResult;
  }

  if (/^(gastei|paguei|comprei)\b/.test(normalized)) {
    return createExpenseOrIncomeFromText(user, body, "expense");
  }

  if (/^(recebi|ganhei|entrou)\b/.test(normalized)) {
    return createExpenseOrIncomeFromText(user, body, "income");
  }

  if (/\b(fatura|limite)\b/.test(normalized)) {
    return replyWithCardInfo(user, body);
  }

  if (/\b(saldo|conta|contas)\b/.test(normalized)) {
    return replyWithBalance(user, body);
  }

  return {
    intent: "fallback",
    status: "unknown_command",
    response:
      "Não entendi o comando. Envie 'ajuda' para ver exemplos de lançamento, saldo, fatura e limite."
  } satisfies AssistantResult;
}

export async function processIncomingWhatsAppTextMessage(message: IncomingTextMessage) {
  const formattedPhone = formatWhatsAppPhone(message.phoneNumber) ?? message.phoneNumber;
  const user = await findUserByPhoneNumber(formattedPhone);

  if (!user || !user.isActive) {
    return {
      handled: true,
      to: formattedPhone,
      response: "Seu número ainda não está vinculado a uma pessoa ativa no Save Point. Atualize o WhatsApp em Configurações."
    };
  }

  const license = resolveTenantLicenseState(user.tenant);

  if (!user.isPlatformAdmin && !license.canAccessApp) {
    return {
      handled: true,
      to: formattedPhone,
      response: "A conta vinculada a você está com a licença indisponível no momento."
    };
  }

  if (!user.isPlatformAdmin && !license.features.whatsappAssistant) {
    return {
      handled: true,
      to: formattedPhone,
      response: "O assistente no WhatsApp está disponível apenas no plano Premium."
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
