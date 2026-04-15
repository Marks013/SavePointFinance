import { hash } from "bcryptjs";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../.env"), override: false });
loadEnv({ path: resolve(process.cwd(), ".env"), override: false });

const baseUrl = process.env.AUDIT_BASE_URL?.trim() || "http://127.0.0.1:3000";

class CookieJar {
  private readonly store = new Map<string, string>();

  private updateFromResponse(response: Response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];

    for (const entry of setCookies) {
      const [pair] = entry.split(";", 1);
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) continue;
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (!name) continue;
      this.store.set(name, value);
    }
  }

  private buildCookieHeader() {
    return Array.from(this.store.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async fetch(input: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    const cookieHeader = this.buildCookieHeader();

    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }

    const response = await fetch(input, {
      ...init,
      headers,
      redirect: init.redirect ?? "manual"
    });

    this.updateFromResponse(response);
    return response;
  }
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function formatLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

async function signIn(email: string, password: string) {
  const jar = new CookieJar();
  const csrfResponse = await jar.fetch(`${baseUrl}/api/auth/csrf`);
  assertCondition(csrfResponse.ok, `Falha ao carregar CSRF: ${csrfResponse.status}`);
  const csrfPayload = (await csrfResponse.json()) as { csrfToken?: string };
  assertCondition(csrfPayload.csrfToken, "CSRF token não encontrado");

  const form = new URLSearchParams();
  form.set("email", email);
  form.set("password", password);
  form.set("csrfToken", csrfPayload.csrfToken);
  form.set("callbackUrl", `${baseUrl}/dashboard`);
  form.set("json", "true");

  const callbackResponse = await jar.fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1"
    },
    body: form
  });

  assertCondition(
    callbackResponse.status === 200 || callbackResponse.status === 302,
    `Falha no login por credenciais: ${callbackResponse.status}`
  );

  const sessionResponse = await jar.fetch(`${baseUrl}/api/auth/session`);
  assertCondition(sessionResponse.ok, `Falha ao carregar sessão: ${sessionResponse.status}`);
  const session = (await sessionResponse.json()) as { user?: { email?: string } } | null;
  assertCondition(session?.user?.email?.toLowerCase() === email.toLowerCase(), "Sessão não foi estabelecida");

  return jar;
}

async function getJson<T>(jar: CookieJar, path: string, init?: RequestInit) {
  const response = await jar.fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {})
    }
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as T)
    : ((await response.text()) as T);

  return {
    status: response.status,
    payload
  };
}

async function main() {
  const { prisma } = await import("../lib/prisma/client");
  const { ensureDefaultPlans, getDefaultPlanBySlug, applyPlanDefaultsToTenant } = await import("../lib/licensing/default-plans");
  const { ensureTenantDefaultCategories } = await import("../lib/finance/default-categories");
  const { getFinanceReport } = await import("../lib/finance/reports");
  const { getAccountsWithComputedBalance } = await import("../lib/finance/accounts");
  const {
    getCurrentStatementMonth,
    getCardExpenseCompetenceDate,
    getCardExpenseDueDate,
    getStatementPaymentDate,
    getStatementRange
  } = await import("../lib/cards/statement");
  const { advanceSubscriptionBillingDate, getSubscriptionBillingDate } = await import("../lib/subscriptions/recurrence");

  await prisma.$connect();
  await ensureDefaultPlans(prisma);

  const unique = Date.now().toString(36);
  const tenantName = `Conta auditoria financeira ${unique}`;
  const tenantSlug = `conta-auditoria-financeira-${unique}`;
  const userEmail = `finance-audit-${unique}@savepoint.local`;
  const userPassword = "FinanceAudit123!";
  const results: string[] = [];
  assertCondition(
    getCurrentStatementMonth({ closeDay: 24, dueDay: 8 }, new Date(2026, 3, 2, 12, 0, 0, 0)) === "2026-04",
    "Competencia padrao da fatura aberta ficou incorreta para cartao com fechamento apos vencimento"
  );
  assertCondition(
    formatLocalDateKey(getCardExpenseCompetenceDate({ closeDay: 24, dueDay: 8 }, new Date(2026, 2, 20, 12, 0, 0, 0))) ===
      "2026-03-20",
    "Compra antes do fechamento nao entrou na fatura esperada"
  );
  const expenseAfterCloseDate = getCardExpenseCompetenceDate(
    { closeDay: 24, dueDay: 8 },
    new Date(2026, 2, 25, 12, 0, 0, 0)
  );
  const expenseAfterCloseMonth = `${expenseAfterCloseDate.getFullYear()}-${String(expenseAfterCloseDate.getMonth() + 1).padStart(2, "0")}`;
  assertCondition(expenseAfterCloseMonth === "2026-04", "Compra apos o fechamento nao foi empurrada para a fatura seguinte");
  assertCondition(
    formatLocalDateKey(getCardExpenseDueDate({ closeDay: 24, dueDay: 8 }, new Date(2026, 2, 24, 12, 0, 0, 0))) ===
      "2026-05-08",
    "Compra no proprio dia do fechamento nao foi empurrada para o vencimento seguinte"
  );
  assertCondition(
    formatLocalDateKey(getStatementPaymentDate(expenseAfterCloseMonth, 8, 24)) === "2026-05-08",
    "Vencimento calculado da compra pos-fechamento ficou incorreto"
  );
  const rolloverStatementRange = getStatementRange("2026-03", 24, 8);
  assertCondition(
    formatLocalDateKey(rolloverStatementRange.start) === "2026-02-24" &&
      formatLocalDateKey(rolloverStatementRange.end) === "2026-03-23",
    "Intervalo da fatura com fechamento no dia 24 ficou inconsistente"
  );
  assertCondition(
    formatLocalDateKey(getCardExpenseCompetenceDate({ closeDay: 1, dueDay: 10 }, new Date(2026, 2, 31, 12, 0, 0, 0))) ===
      "2026-04-30",
    "Compra antes do fechamento no dia 1 nao caiu na fatura de abril"
  );
  assertCondition(
    formatLocalDateKey(getCardExpenseDueDate({ closeDay: 1, dueDay: 10 }, new Date(2026, 3, 1, 12, 0, 0, 0))) ===
      "2026-05-10",
    "Compra no proprio dia do fechamento nao foi empurrada para a fatura de maio"
  );

  const premiumPlan = await getDefaultPlanBySlug(prisma, "premium-completo");
  assertCondition(premiumPlan, "Plano Premium padrão não encontrado");

  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug: tenantSlug,
      ...applyPlanDefaultsToTenant(premiumPlan),
      isActive: true,
      expiresAt: null
    }
  });

  try {
    await ensureTenantDefaultCategories(tenant.id, prisma);
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: userEmail,
        name: "Pessoa Auditoria Financeira",
        passwordHash: await hash(userPassword, 10),
        role: "admin",
        isActive: true,
        preferences: {
          create: {
            emailNotifications: true,
            monthlyReports: true,
            budgetAlerts: true,
            dueReminders: true
          }
        }
      }
    });
    const collaboratorEmail = `finance-audit-collab-${unique}@savepoint.local`;
    const collaboratorPassword = "FinanceAudit123!";
    const collaborator = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: collaboratorEmail,
        name: "Colaborador Auditoria Financeira",
        passwordHash: await hash(collaboratorPassword, 10),
        role: "member",
        isActive: true
      }
    });

    const jar = await signIn(userEmail, userPassword);
    const collaboratorJar = await signIn(collaboratorEmail, collaboratorPassword);

    const salaryCategory = await prisma.category.findFirstOrThrow({
      where: { tenantId: tenant.id, type: "income", name: { equals: "Salário", mode: "insensitive" } }
    });
    const marketCategory = await prisma.category.findFirstOrThrow({
      where: { tenantId: tenant.id, type: "expense", name: { equals: "Supermercado", mode: "insensitive" } }
    });

    const accountA = await getJson<{ id: string }>(jar, "/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Conta Principal Audit",
        type: "checking",
        balance: 1000,
        currency: "BRL",
        color: "#111111",
        institution: "Nubank"
      })
    });
    assertCondition(accountA.status === 201, `Criação da conta principal respondeu ${accountA.status}`);

    const accountB = await getJson<{ id: string }>(jar, "/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Conta Reserva Audit",
        type: "savings",
        balance: 0,
        currency: "BRL",
        color: "#1f2937",
        institution: "Inter"
      })
    });
    assertCondition(accountB.status === 201, `Criação da conta reserva respondeu ${accountB.status}`);

    const card = await getJson<{ id: string }>(jar, "/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Visa Audit",
        brand: "Visa",
        last4: "4321",
        limitAmount: 2000,
        dueDay: 10,
        closeDay: 3,
        color: "#111111",
        institution: "Itaú"
      })
    });
    assertCondition(card.status === 201, `Criação do cartão respondeu ${card.status}`);
    const rolloverCard = await getJson<{ id: string }>(jar, "/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Master Audit Fechamento 24",
        brand: "Mastercard",
        last4: "9876",
        limitAmount: 3000,
        dueDay: 8,
        closeDay: 24,
        color: "#222222",
        institution: "Nubank"
      })
    });
    assertCondition(rolloverCard.status === 201, `Criação do cartão com fechamento 24 respondeu ${rolloverCard.status}`);

    const salaryOne = await getJson<{ id: string }>(jar, "/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-31",
        amount: 1000,
        description: "Salário Janeiro",
        type: "income",
        paymentMethod: "pix",
        categoryId: salaryCategory.id,
        accountId: accountA.payload.id,
        applyTithe: true,
        installments: 1
      })
    });
    assertCondition(salaryOne.status === 201, `Primeira receita respondeu ${salaryOne.status}`);

    const salaryTwo = await getJson<{ id: string }>(collaboratorJar, "/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-31",
        amount: 500,
        description: "Extra Janeiro",
        type: "income",
        paymentMethod: "pix",
        categoryId: salaryCategory.id,
        accountId: accountA.payload.id,
        applyTithe: true,
        installments: 1
      })
    });
    assertCondition(salaryTwo.status === 201, `Segunda receita respondeu ${salaryTwo.status}`);

    const transfer = await getJson<{ id: string }>(jar, "/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-02-01",
        amount: 200,
        description: "Transferência para reserva",
        type: "transfer",
        paymentMethod: "transfer",
        accountId: accountA.payload.id,
        destinationAccountId: accountB.payload.id,
        installments: 1
      })
    });
    assertCondition(transfer.status === 201, `Transferência respondeu ${transfer.status}`);

    const cardInstallments = await getJson<{ id: string }>(jar, "/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-31",
        amount: 300.01,
        description: "Notebook parcelado",
        type: "expense",
        paymentMethod: "credit_card",
        categoryId: marketCategory.id,
        cardId: card.payload.id,
        installments: 3
      })
    });
    assertCondition(cardInstallments.status === 201, `Despesa parcelada respondeu ${cardInstallments.status}`);

    const marketExpense = await getJson<{ id: string }>(jar, "/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-02-05",
        amount: 50,
        description: "Mercado",
        type: "expense",
        paymentMethod: "pix",
        categoryId: marketCategory.id,
        accountId: accountA.payload.id,
        installments: 1
      })
    });
    assertCondition(marketExpense.status === 201, `Despesa à vista respondeu ${marketExpense.status}`);
    const rolloverExpense = await getJson<{ id: string }>(jar, "/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-03-31",
        amount: 80,
        description: "Compra depois do fechamento",
        type: "expense",
        paymentMethod: "credit_card",
        categoryId: marketCategory.id,
        cardId: rolloverCard.payload.id,
        installments: 1
      })
    });
    assertCondition(rolloverExpense.status === 201, `Despesa após fechamento respondeu ${rolloverExpense.status}`);

    const installments = await prisma.transaction.findMany({
      where: {
        tenantId: tenant.id,
        OR: [{ id: cardInstallments.payload.id }, { parentId: cardInstallments.payload.id }]
      },
      orderBy: {
        installmentNumber: "asc"
      }
    });

    assertCondition(installments.length === 3, "O parcelamento não gerou 3 parcelas");
    assertCondition(
      installments.map((item) => item.date.toISOString().slice(0, 10)).join(",") === "2026-01-31,2026-02-28,2026-03-31",
      "As parcelas não respeitaram o avanço correto de mês em data curta"
    );
    const installmentTotal = installments.reduce((sum, item) => sum + Number(item.amount), 0);
    assertCondition(Math.abs(installmentTotal - 300.01) < 0.0001, "O parcelamento perdeu o total ao dividir centavos");
    results.push("Parcelamento respeita meses curtos e mantém o total com centavos");

    const titheTransactions = await prisma.transaction.findMany({
      where: {
        tenantId: tenant.id,
        notes: "[AUTO_TITHE:2026-01]"
      }
    });
    assertCondition(titheTransactions.length === 1, "O dízimo consolidado não foi mantido em lançamento único");
    assertCondition(Math.abs(Number(titheTransactions[0]?.amount ?? 0) - 150) < 0.0001, "O valor do dízimo consolidado ficou incorreto");
    assertCondition(
      [user.id, collaborator.id].includes(titheTransactions[0]?.userId ?? ""),
      "O dízimo consolidado não ficou atribuído a um membro válido da carteira"
    );
    results.push("Dízimo consolida 10% das receitas marcadas em um único lançamento da carteira compartilhada");

    const accountsWithBalance = await getAccountsWithComputedBalance(tenant.id);
    const accountAModel = accountsWithBalance.find((item) => item.id === accountA.payload.id);
    const accountBModel = accountsWithBalance.find((item) => item.id === accountB.payload.id);
    assertCondition(accountAModel, "Conta principal não encontrada no cálculo de saldo");
    assertCondition(accountBModel, "Conta reserva não encontrada no cálculo de saldo");
    assertCondition(Math.abs(accountAModel.currentBalance - 2100) < 0.0001, `Saldo da conta principal incorreto: ${accountAModel.currentBalance}`);
    assertCondition(Math.abs(accountBModel.currentBalance - 200) < 0.0001, `Saldo da conta reserva incorreto: ${accountBModel.currentBalance}`);
    results.push("Saldos das contas refletem receitas, dízimo, despesas e transferências");

    const febStatement = await getJson<{
      summary: { totalAmount: number; dueDate: string; closeDate: string };
      items: Array<{ installmentLabel: string | null }>;
    }>(jar, `/api/cards/${card.payload.id}/statement?month=2026-02`);
    assertCondition(febStatement.status === 200, `Fatura de fevereiro respondeu ${febStatement.status}`);
    assertCondition(Math.abs(febStatement.payload.summary.totalAmount - 100.01) < 0.0001, "Fatura de fevereiro não refletiu a competência correta");
    assertCondition(febStatement.payload.summary.closeDate.startsWith("2026-02-03"), "Fechamento da competência de fevereiro ficou incorreto");
    assertCondition(febStatement.payload.summary.dueDate.startsWith("2026-02-10"), "Vencimento da competência de fevereiro ficou incorreto");

    const marStatement = await getJson<{
      summary: { totalAmount: number };
      items: Array<{ installmentLabel: string | null }>;
    }>(jar, `/api/cards/${card.payload.id}/statement?month=2026-03`);
    assertCondition(marStatement.status === 200, `Fatura de março respondeu ${marStatement.status}`);
    assertCondition(Math.abs(marStatement.payload.summary.totalAmount - 100) < 0.0001, "Fatura de março não refletiu a parcela correta");
    results.push("Faturas respeitam competência, fechamento e vencimento do cartão");

    const installmentsApi = await getJson<{
      items: Array<{
        id: string;
        totalAmount: number;
        installmentsRemaining: number;
        overdueOpenInstallments: number;
      }>;
    }>(jar, "/api/installments?from=2026-01-01&to=2026-03-31");
    assertCondition(installmentsApi.status === 200, `Resumo de parcelamentos respondeu ${installmentsApi.status}`);
    const installmentGroup = installmentsApi.payload.items.find((item) => item.id === cardInstallments.payload.id);
    assertCondition(installmentGroup, "Grupo de parcelamento não apareceu na API de parcelamentos");
    assertCondition(Math.abs(installmentGroup.totalAmount - 300.01) < 0.0001, "Resumo do parcelamento ficou inconsistente");
    assertCondition(installmentGroup.installmentsRemaining === 3, "Parcelas restantes iniciais incorretas");

    const reconcile = await getJson<{ reconciled: number }>(jar, `/api/installments/${cardInstallments.payload.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reconcile_due" })
    });
    assertCondition(reconcile.status === 200, `Reconciliação do parcelamento respondeu ${reconcile.status}`);
    assertCondition(reconcile.payload.reconciled === 3, "Reconciliação não marcou todas as parcelas vencidas");
    results.push("Resumo e reconciliação de parcelamentos funcionam no grupo completo");

    const subscriptionAutoReference = new Date();
    subscriptionAutoReference.setHours(12, 0, 0, 0);
    const manualBillingDate =
      subscriptionAutoReference.getDate() < 6
        ? getSubscriptionBillingDate(
            subscriptionAutoReference.getFullYear(),
            subscriptionAutoReference.getMonth(),
            6
          )
        : getSubscriptionBillingDate(
            subscriptionAutoReference.getFullYear(),
            subscriptionAutoReference.getMonth() + 1,
            6
          );
    const manualNextBillingDate = advanceSubscriptionBillingDate(manualBillingDate, 6);
    const autoBillingDate =
      subscriptionAutoReference.getDate() > 6
        ? getSubscriptionBillingDate(
            subscriptionAutoReference.getFullYear(),
            subscriptionAutoReference.getMonth(),
            6
          )
        : getSubscriptionBillingDate(
            subscriptionAutoReference.getFullYear(),
            subscriptionAutoReference.getMonth() - 1,
            6
          );
    const autoNextBillingDate = advanceSubscriptionBillingDate(autoBillingDate, 6);

    const manualSubscription = await getJson<{ id: string }>(jar, "/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Streaming Audit Manual",
        amount: 29.9,
        billingDay: 6,
        nextBillingDate: formatLocalDateKey(manualBillingDate),
        type: "expense",
        isActive: true,
        autoTithe: false,
        categoryId: marketCategory.id,
        accountId: accountA.payload.id,
        cardId: null
      })
    });
    assertCondition(manualSubscription.status === 201, `Criação da assinatura manual respondeu ${manualSubscription.status}`);

    const generateSubscription = await getJson<{ transactionId: string; duplicated: boolean; nextBillingDate: string }>(
      jar,
      `/api/subscriptions/${manualSubscription.payload.id}/generate-transaction`,
      {
        method: "POST"
      }
    );
    assertCondition(generateSubscription.status === 200, `Geração manual da assinatura respondeu ${generateSubscription.status}`);
    assertCondition(generateSubscription.payload.duplicated === false, "A primeira geração da assinatura foi tratada como duplicada");
    assertCondition(
      formatLocalDateKey(new Date(generateSubscription.payload.nextBillingDate)) === formatLocalDateKey(manualNextBillingDate),
      "Próximo vencimento da assinatura manual não avançou corretamente"
    );
    const manualSubscriptionTransactions = await prisma.transaction.findMany({
      where: {
        tenantId: tenant.id,
        subscriptionId: manualSubscription.payload.id
      },
      orderBy: {
        date: "asc"
      }
    });
    assertCondition(manualSubscriptionTransactions.length === 1, "Assinatura manual não gerou exatamente um lançamento");
    assertCondition(
      formatLocalDateKey(manualSubscriptionTransactions[0]!.date) === formatLocalDateKey(manualBillingDate),
      "Lançamento manual da assinatura foi salvo com a data incorreta"
    );
    results.push("Assinatura manual gera lançamento avulso e avança o próximo vencimento");

    const automaticSubscription = await getJson<{ id: string }>(jar, "/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Streaming Audit Auto",
        amount: 17.9,
        billingDay: 6,
        nextBillingDate: formatLocalDateKey(autoBillingDate),
        type: "expense",
        isActive: true,
        autoTithe: false,
        categoryId: marketCategory.id,
        accountId: accountA.payload.id,
        cardId: null
      })
    });
    assertCondition(automaticSubscription.status === 201, `Criação da assinatura automática respondeu ${automaticSubscription.status}`);
    const automaticSubscriptionModel = await prisma.subscription.findUniqueOrThrow({
      where: {
        id: automaticSubscription.payload.id
      }
    });
    assertCondition(
      formatLocalDateKey(automaticSubscriptionModel.nextBillingDate) === formatLocalDateKey(autoNextBillingDate),
      "Assinatura vencida nao foi sincronizada automaticamente ao criar"
    );
    const automaticSubscriptionTransactions = await prisma.transaction.findMany({
      where: {
        tenantId: tenant.id,
        subscriptionId: automaticSubscription.payload.id
      },
      orderBy: {
        date: "asc"
      }
    });
    assertCondition(
      automaticSubscriptionTransactions.length === 1 &&
        formatLocalDateKey(automaticSubscriptionTransactions[0]!.date) === formatLocalDateKey(autoBillingDate),
      "Assinatura vencida nao gerou o lançamento automático esperado"
    );
    results.push("Assinatura vencida sincroniza automaticamente e preserva a competência correta");

    results.push("Competencia aberta e competencia da compra respeitam fechamento e vencimento do cartao");

    const report = await getFinanceReport(
      tenant.id,
      {
        month: "2026-01"
      }
    );
    assertCondition(Math.abs(report.summary.income - 1500) < 0.0001, `Receitas do relatório incoerentes: ${report.summary.income}`);
    assertCondition(Math.abs(report.summary.expense - 300.01) < 0.0001, `Despesas do relatório incoerentes: ${report.summary.expense}`);
    assertCondition(Math.abs(report.summary.transfer - 200) < 0.0001, `Transferências do relatório incoerentes: ${report.summary.transfer}`);
    assertCondition(Math.abs(report.summary.balance - 1199.99) < 0.0001, `Saldo do relatório incoerente: ${report.summary.balance}`);
    assertCondition(
      report.byCard.some((item) => item.id === card.payload.id && Math.abs(item.netStatement - 100.01) < 0.0001),
      "Resumo por cartão do relatório não bate com as parcelas nas competências"
    );
    assertCondition(
      report.byAccount.some((item) => item.id === accountA.payload.id && Math.abs(item.net - 1100) < 0.0001),
      "Movimentação por conta do relatório não bate com o período auditado"
    );
    results.push("Relatórios consolidam receitas, despesas, transferências, contas e cartões com coerência");

    const reportApi = await getJson<{
      summary: { income: number; expense: number; transfer: number; balance: number };
      byCard: Array<{ id: string; netStatement: number }>;
    }>(jar, "/api/reports/summary?from=2026-01-01&to=2026-02-28");
    assertCondition(reportApi.status === 200, `API de relatório respondeu ${reportApi.status}`);
    assertCondition(Math.abs(reportApi.payload.summary.balance - report.summary.balance) < 0.0001, "API de relatório diverge do cálculo central");
    results.push("API de relatórios e cálculo central retornam o mesmo consolidado");

    const marchTransactions = await getJson<{
      items: Array<{ id: string }>;
    }>(jar, `/api/transactions?from=2026-03-01&to=2026-03-31&cardId=${rolloverCard.payload.id}`);
    assertCondition(marchTransactions.status === 200, `Transações de março responderam ${marchTransactions.status}`);
    assertCondition(
      !marchTransactions.payload.items.some((item) => item.id === rolloverExpense.payload.id),
      "Compra após o fechamento apareceu na competência de março"
    );

    const aprilTransactions = await getJson<{
      items: Array<{ id: string }>;
    }>(jar, `/api/transactions?from=2026-04-01&to=2026-04-30&cardId=${rolloverCard.payload.id}`);
    assertCondition(aprilTransactions.status === 200, `Transações de abril responderam ${aprilTransactions.status}`);
    assertCondition(
      aprilTransactions.payload.items.some((item) => item.id === rolloverExpense.payload.id),
      "Compra após o fechamento não apareceu na competência de abril"
    );

    const marchReport = await getJson<{
      byCard: Array<{ id: string; netStatement: number }>;
    }>(jar, `/api/reports/summary?from=2026-03-01&to=2026-03-31&cardId=${rolloverCard.payload.id}`);
    assertCondition(marchReport.status === 200, `Relatório de março respondeu ${marchReport.status}`);
    assertCondition(
      !marchReport.payload.byCard.some((item) => item.id === rolloverCard.payload.id && item.netStatement > 0),
      "Compra após o fechamento entrou indevidamente no relatório de março"
    );

    const aprilReport = await getJson<{
      byCard: Array<{ id: string; netStatement: number }>;
    }>(jar, `/api/reports/summary?from=2026-04-01&to=2026-04-30&cardId=${rolloverCard.payload.id}`);
    assertCondition(aprilReport.status === 200, `Relatório de abril respondeu ${aprilReport.status}`);
    assertCondition(
      aprilReport.payload.byCard.some(
        (item) => item.id === rolloverCard.payload.id && Math.abs(item.netStatement - 80) < 0.0001
      ),
      "Compra após o fechamento não entrou na competência de abril do relatório"
    );
    results.push("Compras após o fechamento entram na competência seguinte em transações e relatórios");

    const dashboardResponse = await jar.fetch(`${baseUrl}/dashboard`);
    assertCondition(dashboardResponse.status === 200, `Dashboard respondeu ${dashboardResponse.status}`);
    const dashboardHtml = await dashboardResponse.text();
    assertCondition(/Painel financeiro/i.test(dashboardHtml), "Dashboard não renderizou o conteúdo esperado");
    results.push("Dashboard protegido renderiza normalmente com o núcleo financeiro carregado");

    console.log("FINANCE_AUDIT_OK");
    for (const item of results) {
      console.log(`- ${item}`);
    }
  } finally {
    await prisma.tenant.deleteMany({
      where: { id: tenant.id }
    });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("FINANCE_AUDIT_FAILED");
  console.error(error instanceof Error ? error.message : error);
  const { prisma } = await import("../lib/prisma/client");
  await prisma.$disconnect();
  process.exitCode = 1;
});
