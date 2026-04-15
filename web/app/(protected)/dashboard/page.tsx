import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BellRing, CreditCard, Landmark, Target } from "lucide-react";

import { SummaryCards } from "@/features/dashboard/components/summary-cards";
import { syncDueSubscriptionTransactions } from "@/lib/automation/subscriptions";
import { requireSessionUser } from "@/lib/auth/session";
import {
  getNextPayableStatementSnapshot,
  getCardStatementSnapshots
} from "@/lib/cards/statement";
import { ensureTenantCardStatementSnapshots } from "@/lib/cards/snapshot-sync";
import { getAccountsWithComputedBalance } from "@/lib/finance/accounts";
import { getFinanceReport } from "@/lib/finance/reports";
import { formatMonthKeyLabel, getCurrentMonthKey, getMonthRange, normalizeMonthKey } from "@/lib/month";
import { prisma } from "@/lib/prisma/client";
import { formatCurrency } from "@/lib/utils";

function formatDate(value: Date | string | null | undefined) {
  if (!value) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short"
  }).format(new Date(value));
}

function getMonthPerspective(month: string) {
  const currentMonth = getCurrentMonthKey();

  if (month === currentMonth) {
    return "current";
  }

  return month > currentMonth ? "future" : "past";
}

function getStatementReferenceDate(month: string) {
  if (month === getCurrentMonthKey()) {
    return new Date();
  }

  return getMonthRange(month).end;
}

async function getDashboardData(tenantId: string, month: string) {
  const { start, end } = getMonthRange(month);
  const statementReferenceDate = getStatementReferenceDate(month);
  await ensureTenantCardStatementSnapshots(tenantId);

  try {
    const [accounts, monthlyReport, goals, recentTransactions, upcomingSubscriptions, upcomingGoals, activeCards] =
      await Promise.all([
        getAccountsWithComputedBalance(tenantId),
        getFinanceReport(tenantId, { month }),
        prisma.goal.aggregate({
          where: {
            tenantId,
            isCompleted: false
          },
          _sum: {
            currentAmount: true
          }
        }),
        prisma.transaction.findMany({
          where: {
            tenantId,
            competence: month
          },
          include: {
            category: true,
            financialAccount: true,
            destinationAccount: true,
            card: true
          },
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: 6
        }),
        prisma.subscription.findMany({
          where: {
            tenantId,
            isActive: true,
            nextBillingDate: {
              gte: start,
              lte: end
            }
          },
          include: {
            account: true,
            card: true
          },
          orderBy: {
            nextBillingDate: "asc"
          },
          take: 5
        }),
        prisma.goal.findMany({
          where: {
            tenantId,
            isCompleted: false,
            deadline: {
              not: null,
              gte: start,
              lte: end
            }
          },
          orderBy: {
            deadline: "asc"
          },
          take: 5
        }),
        prisma.card.findMany({
          where: {
            tenantId,
            isActive: true
          },
          orderBy: {
            createdAt: "desc"
          }
        })
      ]);

    const cardStatements = await getCardStatementSnapshots({
      tenantId,
      cards: activeCards,
      client: prisma,
      month
    });
    const payableStatements = await Promise.all(
      activeCards.map(async (card) => ({
        cardId: card.id,
        statement: await getNextPayableStatementSnapshot({
          tenantId,
          card,
          referenceDate: statementReferenceDate,
          client: prisma
        })
      }))
    );
    const statementByCardId = new Map(cardStatements.map((item) => [item.card.id, item]));
    const payableStatementByCardId = new Map(payableStatements.map((item) => [item.cardId, item.statement]));
    const cardsWithStatement = activeCards.map((card) => {
      const statement = statementByCardId.get(card.id);
      const payableStatement = payableStatementByCardId.get(card.id) ?? statement;

      return {
        ...card,
        statementMonth: statement?.month ?? month,
        closeDate: statement?.closeDate ?? null,
        dueDate: statement?.dueDate ?? null,
        statementAmount: statement?.totalAmount ?? 0,
        statementOutstandingAmount: statement?.statementOutstandingAmount ?? 0,
        outstandingAmount: statement?.outstandingAmount ?? 0,
        availableLimit: statement?.availableLimit ?? Number(card.limitAmount),
        payableStatementMonth: payableStatement?.month ?? month,
        payableDueDate: payableStatement?.dueDate ?? null,
        payableStatementAmount: payableStatement?.statementOutstandingAmount ?? 0
      };
    });

    const monthlyCardPayments = monthlyReport.projection.cardPayments;
    const periodExpenseForecast = monthlyReport.projection.expense;

    return {
      periodBalances: monthlyReport.periodBalances,
      periodResult: monthlyReport.summary.balance,
      income: monthlyReport.summary.income,
      expenses: monthlyReport.summary.expense,
      averageDailyExpense: monthlyReport.summary.averageDailyExpense,
      classification: monthlyReport.classification,
      spendingInsights: monthlyReport.spendingInsights,
      monthlyCardPayments,
      periodExpenseForecast,
      upcomingProjection: monthlyReport.upcoming.slice(0, 5),
      goals: Number(goals._sum.currentAmount ?? 0),
      recentTransactions: recentTransactions.map((transaction) => ({
        ...transaction,
        competenceDate: transaction.competence ? new Date(`${transaction.competence}-01T12:00:00`) : null,
        payableDate: transaction.statementDueDate
      })),
      upcomingSubscriptions,
      upcomingGoals,
      activeAccounts: accounts
        .filter((account) => account.isActive)
        .sort((a, b) => b.currentBalance - a.currentBalance)
        .slice(0, 4),
      activeCards: cardsWithStatement.slice(0, 4)
    };
  } catch (error) {
    console.error("Failed to load dashboard data", error);
    return {
      periodBalances: {
        opening: 0,
        closing: 0,
        net: 0
      },
      periodResult: 0,
      income: 0,
      expenses: 0,
      averageDailyExpense: 0,
      classification: {
        autoClassified: 0,
        uncategorized: 0,
        coverage: 0
      },
      spendingInsights: {
        topCategory: null,
        essentialExpenses: 0,
        lifestyleExpenses: 0,
        categoryBreakdown: []
      },
      monthlyCardPayments: 0,
      periodExpenseForecast: 0,
      upcomingProjection: [],
      goals: 0,
      recentTransactions: [],
      upcomingSubscriptions: [],
      upcomingGoals: [],
      activeAccounts: [],
      activeCards: []
    };
  }
}

type DashboardPageProps = {
  searchParams?: Promise<{
    month?: string;
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await requireSessionUser();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const month = normalizeMonthKey(resolvedSearchParams?.month);
  await syncDueSubscriptionTransactions({
    tenantId: user.tenantId,
    userId: user.id
  });
  const data = await getDashboardData(user.tenantId, month);
  const monthLabel = formatMonthKeyLabel(month);
  const monthPerspective = getMonthPerspective(month);
  const commitmentCardNote =
    monthPerspective === "current"
      ? "Recorrências e faturas ainda previstas para este mês."
      : monthPerspective === "future"
        ? "Recorrências e faturas previstas para o mês selecionado."
        : "Recorrências e faturas mapeadas para a competência selecionada.";
  const dueSectionTitle =
    monthPerspective === "current" ? "Próximos vencimentos" : monthPerspective === "future" ? "Vencimentos previstos" : "Vencimentos do período";
  const dueSectionEmpty =
    monthPerspective === "current"
      ? "Nenhuma cobrança futura encontrada."
      : monthPerspective === "future"
        ? "Nenhum vencimento previsto para o período."
        : "Nenhum vencimento encontrado no período.";
  const goalSectionTitle = monthPerspective === "current" ? "Metas com prazo próximo" : "Metas com prazo no período";
  const movementSectionCopy =
    "Lançamentos contabilizados dentro da competência selecionada, mesmo quando a compra original aconteceu em outra data.";

  return (
    <div className="space-y-6 py-4">
      <section className="grid gap-4 2xl:grid-cols-[1.2fr_0.8fr]">
        <article className="surface overflow-hidden rounded-[34px] p-6 md:p-8">
          <div className="section-stack">
            <div className="page-intro">
              <div className="eyebrow">Painel financeiro</div>
              <h1 className="page-title max-w-3xl">Visão central da operação em {monthLabel}</h1>
              <p className="page-copy">
                Acompanhe resultado por competência, caixa real das contas e compromissos do período sem misturar
                naturezas diferentes.
              </p>
            </div>

            <div className="metric-grid-compact">
              <div className="editorial-panel">
                <p className="metric-label">Resultado do período</p>
                <p
                  className={`subtle-metric-value amount-nowrap mt-3 ${
                    data.periodResult >= 0 ? "text-[var(--color-emerald-600)]" : "amount-negative"
                  }`}
                >
                  {formatCurrency(data.periodResult)}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">
                  Diferença entre receitas e despesas pela competência financeira.
                </p>
              </div>
              <div className="editorial-panel">
                <p className="metric-label">Saldo inicial do período</p>
                <p
                  className={`subtle-metric-value amount-nowrap mt-3 ${
                    data.periodBalances.opening < 0 ? "amount-negative" : "text-[var(--color-foreground)]"
                  }`}
                >
                  {formatCurrency(data.periodBalances.opening)}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">
                  Caixa real das contas no primeiro dia da competência.
                </p>
              </div>
              <div className="editorial-panel">
                <p className="metric-label">Saldo final do período</p>
                <p
                  className={`subtle-metric-value amount-nowrap mt-3 ${
                    data.periodBalances.closing < 0 ? "amount-negative" : "text-[var(--color-foreground)]"
                  }`}
                >
                  {formatCurrency(data.periodBalances.closing)}
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-ink-700)]">
                  Caixa real das contas após os lançamentos datados no período.
                </p>
              </div>
            </div>

            <div className="mt-1 flex flex-wrap gap-3">
              <ButtonLink ariaLabel="Criar nova transação" href="/dashboard/transactions" month={month} primary>
                Nova transação
                <ArrowRight className="size-4" />
              </ButtonLink>
              <ButtonLink ariaLabel="Abrir relatórios" href="/dashboard/reports" month={month}>
                Ver relatórios
              </ButtonLink>
            </div>
          </div>
        </article>

        <article className="surface-strong rounded-[34px] p-6 md:p-8">
          <div className="section-stack">
            <div>
              <p className="metric-label text-white/78">Caixa contabilizado na competência</p>
              <h2
                className={`hero-amount amount-nowrap mt-4 ${
                  data.periodBalances.closing < 0 ? "amount-negative" : "text-white"
                }`}
              >
                {formatCurrency(data.periodBalances.closing)}
              </h2>
              <p className="mt-3 max-w-sm text-sm leading-7 text-white/80">
                Posição das contas dentro da competência selecionada, sem misturar com o caixa real de hoje.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-[24px] border border-white/12 bg-white/8 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/66">Faturas com vencimento no período</p>
                <p className="subtle-metric-value amount-nowrap mt-2 text-white">
                  {formatCurrency(data.monthlyCardPayments)}
                </p>
                <p className="mt-2 text-sm leading-6 text-white/70">
                  Soma das faturas que vencem dentro da competência aberta na navegação.
                </p>
              </div>
              <div className="rounded-[24px] border border-white/12 bg-white/8 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/66">Saídas previstas no período</p>
                <p
                  className={`subtle-metric-value amount-nowrap mt-2 ${
                    data.periodExpenseForecast > 0 ? "amount-negative" : "text-white"
                  }`}
                >
                  {formatCurrency(data.periodExpenseForecast)}
                </p>
                <p className="mt-2 text-sm leading-6 text-white/70">{commitmentCardNote}</p>
              </div>
            </div>
          </div>
        </article>
      </section>

      <SummaryCards
        data={{
          openingBalance: data.periodBalances.opening,
          closingBalance: data.periodBalances.closing,
          income: data.income,
          expenses: data.expenses,
          averageDailyExpense: data.averageDailyExpense
        }}
      />

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="surface content-section">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Leitura rápida dos gastos</h2>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                Onde o gasto mais pesa, quanto está classificado e qual parte é estrutural.
              </p>
            </div>
            <Link className="text-sm font-medium text-[var(--color-primary)]" href={`/dashboard/reports?month=${month}`}>
              Abrir análise completa
            </Link>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <div className="data-card p-4">
              <p className="metric-label">Maior pressão</p>
              <p className="mt-3 text-base font-semibold">{data.spendingInsights.topCategory?.name ?? "Sem dados suficientes"}</p>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                {data.spendingInsights.topCategory
                  ? `${formatCurrency(data.spendingInsights.topCategory.total)} • ${Math.round(
                      data.spendingInsights.topCategory.share * 100
                    )}% das saídas`
                  : "As categorias aparecerão aqui conforme você registrar movimentações."}
              </p>
            </div>
            <div className="data-card p-4">
              <p className="metric-label">Estruturais</p>
              <p className="amount-nowrap mt-3 text-base font-semibold">
                {formatCurrency(data.spendingInsights.essentialExpenses)}
              </p>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                Moradia, utilidades e despesas de manutenção da rotina.
              </p>
            </div>
            <div className="data-card p-4">
              <p className="metric-label">Cobertura de categoria</p>
              <p className="mt-3 text-base font-semibold">{Math.round(data.classification.coverage * 100)}%</p>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                {data.classification.autoClassified} automáticas • {data.classification.uncategorized} sem categoria.
              </p>
            </div>
          </div>

          <div className="metric-grid-compact mt-5">
            {data.spendingInsights.categoryBreakdown.slice(0, 4).map((item) => (
              <div key={item.name} className="data-card px-4 py-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {item.items} lançamentos • {Math.round(item.share * 100)}% do total
                    </p>
                  </div>
                  <p className="amount-nowrap max-w-full text-right text-sm font-semibold sm:w-auto">
                    {formatCurrency(item.total)}
                  </p>
                </div>
              </div>
            ))}
            {data.spendingInsights.categoryBreakdown.length === 0 ? (
              <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
                Registre movimentações para visualizar o mapa de categorias e entender melhor seus gastos.
              </div>
            ) : null}
          </div>
        </article>

        <article className="surface content-section">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Movimento recente</h2>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                {movementSectionCopy}
              </p>
            </div>
            <Link className="text-sm font-medium text-[var(--color-primary)]" href={`/dashboard/transactions?month=${month}`}>
              Abrir transações
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {data.recentTransactions.length > 0 ? (
              data.recentTransactions.map((transaction) => (
                <div key={transaction.id} className="data-card flex flex-wrap items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">{transaction.description}</p>
                    <p className="break-words text-xs text-[var(--color-muted-foreground)]">
                      {transaction.card ? `Compra em ${formatDate(transaction.date)}` : formatDate(transaction.date)} •{" "}
                      {transaction.category?.name ?? "Sem categoria"} •{" "}
                      {transaction.card?.name ??
                        (transaction.destinationAccount
                          ? `${transaction.financialAccount?.name ?? "Sem origem"} → ${transaction.destinationAccount.name}`
                          : transaction.financialAccount?.name ?? "Sem origem")}
                    </p>
                    {transaction.card && transaction.competenceDate && transaction.payableDate ? (
                      <p className="mt-1 break-words text-xs text-[var(--color-muted-foreground)]">
                        Competência {formatMonthKeyLabel(transaction.competence)} • vence{" "}
                        {formatDate(transaction.payableDate)}
                      </p>
                    ) : null}
                  </div>
                  <p
                    className={`amount-nowrap w-full text-left text-sm font-semibold sm:w-auto sm:text-right ${
                      transaction.type === "income"
                        ? "text-[var(--color-emerald-600)]"
                        : transaction.type === "expense"
                          ? "amount-negative"
                          : "text-[var(--color-foreground)]"
                    }`}
                  >
                    {transaction.type === "expense" ? "-" : transaction.type === "income" ? "+" : ""}
                    {formatCurrency(Number(transaction.amount))}
                  </p>
                </div>
              ))
            ) : (
              <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
                Ainda não há transações registradas para exibir nesta área.
              </div>
            )}
          </div>
        </article>

        <div className="grid gap-4">
          <article className="surface content-section">
            <div className="flex items-center gap-3">
              <BellRing className="size-5 text-[var(--color-primary)]" />
              <h2 className="text-xl font-semibold">{dueSectionTitle}</h2>
            </div>

            <div className="mt-5 space-y-3">
              {data.upcomingProjection.length > 0 ? (
                data.upcomingProjection.map((item) => (
                  <div key={`${item.source}-${item.reference}`} className="data-card px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <p className="min-w-0 flex-1 break-words text-sm font-medium">{item.label}</p>
                      <p
                        className={`amount-nowrap w-full text-left text-sm font-semibold sm:w-auto sm:text-right ${
                          item.type === "income" ? "text-[var(--color-primary)]" : "amount-negative"
                        }`}
                      >
                        {formatCurrency(Number(item.amount))}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                      {formatDate(item.date)} •{" "}
                      {item.source === "subscription"
                        ? "Recorrência"
                        : item.source === "card_statement"
                          ? "Fatura do cartão"
                          : "Prazo de meta"}
                    </p>
                  </div>
                ))
              ) : (
                <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
                  {dueSectionEmpty}
                </div>
              )}
            </div>
          </article>

          <article className="surface content-section">
            <div className="flex items-center gap-3">
              <Target className="size-5 text-[var(--color-gold-500)]" />
              <h2 className="text-xl font-semibold">{goalSectionTitle}</h2>
            </div>

            <div className="mt-5 space-y-3">
              {data.upcomingGoals.length > 0 ? (
                data.upcomingGoals.map((goal) => {
                  const progress =
                    Number(goal.targetAmount) > 0 ? Number(goal.currentAmount) / Number(goal.targetAmount) : 0;

                  return (
                    <div key={goal.id} className="data-card px-4 py-3">
                      <div className="flex items-start justify-between gap-4">
                        <p className="min-w-0 flex-1 break-words text-sm font-medium">{goal.name}</p>
                        <p className="shrink-0 text-xs font-semibold text-[var(--color-muted-foreground)]">
                          {Math.round(progress * 100)}%
                        </p>
                      </div>
                      <p className="mt-1 break-words text-xs text-[var(--color-muted-foreground)]">
                        Vence em {formatDate(goal.deadline)} • Atual {formatCurrency(Number(goal.currentAmount))} de{" "}
                        {formatCurrency(Number(goal.targetAmount))}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
                  Nenhuma meta com prazo curto no momento.
                </div>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-4 2xl:grid-cols-[0.82fr_1.18fr]">
        <article className="surface content-section">
          <div className="flex items-center gap-3">
            <Landmark className="size-5 text-[var(--color-primary)]" />
            <h2 className="text-xl font-semibold">Resumo das contas</h2>
          </div>

          <div className="metric-grid-compact mt-5">
            <div className="data-card px-4 py-4">
              <p className="metric-label">Contas ativas</p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-[var(--color-foreground)]">
                {data.activeAccounts.length}
              </p>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                {data.activeAccounts.length > 0
                  ? `Maior saldo em ${data.activeAccounts[0]?.name ?? "conta ativa"}`
                  : "Nenhuma conta ativa cadastrada."}
              </p>
            </div>
            <div className="data-card px-4 py-4">
              <p className="metric-label">Maior saldo</p>
              <p
                className={`amount-nowrap mt-3 max-w-full text-[clamp(1.25rem,4vw,2rem)] font-semibold tracking-[-0.05em] ${
                  (data.activeAccounts[0]?.currentBalance ?? 0) < 0 ? "amount-negative" : "text-[var(--color-foreground)]"
                }`}
              >
                {formatCurrency(data.activeAccounts[0]?.currentBalance ?? 0)}
              </p>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                {data.activeAccounts[0]?.name ?? "Sem conta de referência"}
              </p>
            </div>
          </div>

        </article>

        <div className="grid gap-4">
          <article className="surface content-section">
            <div className="flex items-center gap-3">
              <CreditCard className="size-5 text-[var(--color-coral-500)]" />
              <h2 className="text-xl font-semibold">Cartões em operação</h2>
            </div>

            <div className="mt-5 space-y-3">
              {data.activeCards.length > 0 ? (
                data.activeCards.map((card) => (
                  <div key={card.id} className="data-card space-y-3 px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{card.name}</p>
                        <p className="break-words text-xs text-[var(--color-muted-foreground)]">
                          {card.brand} {card.last4 ? `• Final ${card.last4}` : ""} • Fecha em {formatDate(card.closeDate)}
                        </p>
                      </div>
                      <div className="w-full sm:w-auto sm:text-right">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted-foreground)]">
                          Próximo vencimento
                        </p>
                        <p className="subtle-metric-value amount-nowrap mt-2 text-[var(--color-foreground)]">
                          {formatCurrency(Number(card.payableStatementAmount))}
                        </p>
                        <p className="mt-1 break-words text-xs text-[var(--color-muted-foreground)]">
                          {card.payableStatementAmount > 0
                            ? `Vence em ${formatDate(card.payableDueDate)}`
                            : "Sem cobrança prevista neste mês"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-4 text-xs text-[var(--color-muted-foreground)]">
                        <span>Limite utilizado</span>
                        <span>
                          {Math.round(
                            Math.min((Number(card.outstandingAmount) / Math.max(Number(card.limitAmount), 1)) * 100, 100)
                          )}
                          %
                        </span>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${Math.min(
                              (Number(card.outstandingAmount) / Math.max(Number(card.limitAmount), 1)) * 100,
                              100
                            )}%`
                          }}
                        />
                      </div>
                    </div>

                    <div className="detail-grid">
                      <div className="rounded-[1.1rem] border border-[var(--color-border)]/70 bg-[var(--color-muted)]/25 px-3 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                          Competencia aberta
                        </p>
                        <p className="amount-nowrap mt-2 text-sm font-medium text-[var(--color-foreground)]">
                          {formatCurrency(Number(card.statementAmount))}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                          Competência {formatMonthKeyLabel(card.statementMonth)}
                        </p>
                      </div>
                      <div className="rounded-[1.1rem] border border-[var(--color-border)]/70 bg-[var(--color-muted)]/25 px-3 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                          Vencimento
                        </p>
                        <p className="mt-2 break-words text-sm font-medium text-[var(--color-foreground)]">
                          {formatDate(card.payableDueDate)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                          Referente a {formatMonthKeyLabel(card.payableStatementMonth)}
                        </p>
                      </div>
                      <div className="rounded-[1.1rem] border border-[var(--color-border)]/70 bg-[var(--color-muted)]/25 px-3 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                          Limite disponível
                        </p>
                        <p
                          className={`amount-nowrap mt-2 text-sm font-medium ${
                            Number(card.availableLimit) < 0 ? "amount-negative" : "text-[var(--color-foreground)]"
                          }`}
                        >
                          {formatCurrency(Number(card.availableLimit))}
                        </p>
                      </div>
                      <div className="rounded-[1.1rem] border border-[var(--color-border)]/70 bg-[var(--color-muted)]/25 px-3 py-3">
                        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">
                          Saldo total do cartao
                        </p>
                        <p className="amount-nowrap mt-2 text-sm font-medium text-[var(--color-foreground)]">
                          {formatCurrency(Number(card.outstandingAmount))}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
                  Nenhum cartão ativo cadastrado.
                </div>
              )}
            </div>
          </article>

          <article className="surface content-section">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Acesso rápido</h2>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  Módulos mais usados na rotina financeira.
                </p>
              </div>
            </div>

            <div className="metric-grid-compact mt-5">
              <QuickAccessLink copy="Saldo, bancos e movimentação por conta." href="/dashboard/accounts" label="Contas" month={month} />
              <QuickAccessLink copy="Faturas, limite e uso mensal." href="/dashboard/cards" label="Cartões" month={month} />
              <QuickAccessLink copy="Objetivos e reservas planejadas." href="/dashboard/goals" label="Metas" month={month} />
              <QuickAccessLink copy="Perfil, notificações e automações." href="/dashboard/settings" label="Configurações" month={month} />
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

function QuickAccessLink({
  href,
  label,
  copy,
  month
}: {
  href: Route;
  label: string;
  copy: string;
  month: string;
}) {
  return (
    <Link
      className="data-card group flex items-start justify-between gap-4 px-4 py-3 transition hover:border-[rgba(19,111,79,0.22)]"
      href={`${href}?month=${month}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--color-foreground)]">{label}</p>
        <p className="mt-1 break-words text-xs leading-5 text-[var(--color-muted-foreground)]">{copy}</p>
      </div>
      <ArrowRight className="mt-0.5 size-4 shrink-0 text-[var(--color-muted-foreground)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-primary)]" />
    </Link>
  );
}

function ButtonLink({
  href,
  children,
  primary = false,
  ariaLabel,
  month
}: {
  href: Route;
  children: ReactNode;
  primary?: boolean;
  ariaLabel?: string;
  month: string;
}) {
  return (
    <Link
      aria-label={ariaLabel}
      className={
        primary
          ? "inline-flex items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-[var(--color-primary-foreground)] shadow-[0_16px_36px_rgba(19,111,79,0.18)] transition hover:-translate-y-0.5 hover:bg-[var(--color-emerald-600)]"
          : "inline-flex items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-3 text-sm font-semibold transition hover:-translate-y-0.5"
      }
      href={`${href}?month=${month}`}
    >
      {children}
    </Link>
  );
}
