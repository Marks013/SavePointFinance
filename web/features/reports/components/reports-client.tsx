"use client";

import type { ReactNode } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarRange, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDateDisplay } from "@/lib/date";
import { formatMonthKeyLabel, formatYearLabel, getMonthRange, getYearRange, normalizeMonthKey } from "@/lib/month";
import { ensureApiResponse } from "@/lib/observability/http";
import { formatCurrency } from "@/lib/utils";

type Tone = "positive" | "attention" | "warning";

type CategoryItem = {
  id?: string | null;
  name: string;
  total: number;
  items: number;
  share: number;
};

type AccountItem = {
  id: string;
  name: string;
  usage?: "standard" | "benefit_food";
  income: number;
  expense: number;
  net: number;
};

type CardItem = {
  id: string;
  name: string;
  brand: string;
  refunds: number;
  netStatement: number;
  transactions: number;
};

type RecentItem = {
  id: string;
  description: string;
  amount: number;
  type: string;
  date: string;
  category: string;
  account: string | null;
  destinationAccount: string | null;
  card: string | null;
};

type UpcomingItem = {
  reference: string;
  source: "subscription" | "card_statement" | "goal_deadline";
  label: string;
  date: string;
  type: "income" | "expense";
  amount: number;
};

type AnnualAlert = {
  tone: Tone;
  title: string;
  detail: string;
};

type MonthlySeriesItem = {
  label: string;
  income: number;
  expense: number;
  transfer: number;
  balance?: number;
};

type ReportResponse = {
  labels?: {
    periodTitle?: string;
    periodSubtitle?: string;
    scopeLabel?: string;
    baseMonthLabel?: string;
  };
  period?: {
    scope: "month" | "year" | "custom";
    months: number;
  };
  summary?: {
    income: number;
    expense: number;
    balance: number;
    savingsRate: number;
    transactions: number;
    averageDailyExpense: number;
    uncategorizedExpense: number;
  };
  benefits?: {
    foodWallets?: number;
    foodBalance?: number;
    foodIncome?: number;
    foodExpense?: number;
  };
  periodBalances?: {
    opening: number;
    closing: number;
  };
  annualInsights?: {
    narrative?: {
      tone: Tone;
      headline: string;
      summary: string;
      focus: string;
    };
    alerts?: AnnualAlert[];
    cadence?: {
      activeMonths: number;
      positiveMonths: number;
      negativeMonths: number;
      neutralMonths: number;
      averageMonthlyBalance: number;
      balanceSpread: number;
    };
    concentration?: {
      topCategoriesShare: number;
      uncategorizedExpenseShare: number;
    };
    highlights?: {
      bestMonth?: { label: string; balance: number };
      worstMonth?: { label: string; balance: number };
      strongestQuarter?: { label: string; balance: number };
      weakestQuarter?: { label: string; balance: number };
    };
  };
  spendingInsights?: {
    topCategory?: CategoryItem | null;
    essentialExpenses?: number;
    lifestyleExpenses?: number;
    categoryBreakdown?: CategoryItem[];
  };
  comparison?: {
    transferShare?: number;
  };
  byCategory?: CategoryItem[];
  monthly?: MonthlySeriesItem[];
  byAccount?: AccountItem[];
  byCard?: CardItem[];
  recent?: RecentItem[];
  upcoming?: UpcomingItem[];
  license?: {
    features?: {
      pdfExport?: boolean;
    };
  };
};

type OptionItem = { id: string; name: string };

const palette = ["#1F8F62", "#DB6B4D", "#3B82F6", "#B9851B", "#0F766E", "#7A8F44"];
const chartGlowPalette = ["rgba(31,143,98,0.28)", "rgba(219,107,77,0.24)", "rgba(59,130,246,0.24)", "rgba(185,133,27,0.22)"];

function pct(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSavingsRate(rate: number, income: number) {
  if (income <= 0) {
    return "N/A";
  }

  return pct(rate);
}

function amountClass(value: number) {
  if (value < 0) return "amount-negative";
  if (value > 0) return "amount-positive";
  return "text-[var(--color-foreground)]";
}

function toneBadgeClass(tone: Tone) {
  if (tone === "warning") return "border-[rgba(223,164,85,0.35)] bg-[rgba(79,50,12,0.18)] text-[#f3d39a]";
  if (tone === "positive") return "border-[rgba(99,191,148,0.35)] bg-[rgba(16,57,44,0.18)] text-[var(--color-primary-foreground)]";
  return "border-[rgba(214,199,172,0.24)] bg-[rgba(20,29,34,0.38)] text-[var(--color-muted-foreground)]";
}

function tonePanelClass(tone: Tone) {
  if (tone === "warning") return "warning-panel warning-copy";
  if (tone === "positive") return "attention-panel attention-copy";
  return "muted-panel";
}

function toneLabel(tone: Tone) {
  if (tone === "warning") return "Pressao";
  if (tone === "positive") return "Saudavel";
  return "Atencao";
}

function categoryShareLabel(value: number) {
  return value >= 0.01 ? pct(value, value >= 0.1 ? 0 : 1) : "<1%";
}

function ChartTooltipContent({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip text-sm">
      {label ? <p className="mb-2 font-semibold text-[var(--color-foreground)]">{label}</p> : null}
      <div className="space-y-1.5">
        {payload.map((item) => (
          <div key={`${label}-${item.name}`} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-[var(--color-muted-foreground)]">{item.name}</span>
            </div>
            <span className={`font-medium ${amountClass(Number(item.value ?? 0))}`}>{formatCurrency(Number(item.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DeferredResponsiveChart({
  children,
  height = 320
}: {
  children: ReactNode;
  height?: number;
}) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setIsMounted(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="mt-6 min-w-0" style={{ height }}>
      {isMounted ? (
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={height}>
          {children}
        </ResponsiveContainer>
      ) : (
        <div className="muted-panel h-full w-full animate-pulse rounded-[1.5rem] border border-dashed" />
      )}
    </div>
  );
}

async function getOptions<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar opcoes", method: "GET", path: url });
  if (!response.ok) throw new Error("Falha ao carregar opções");
  return ((await response.json()) as { items: T[] }).items;
}

async function getReportSummary(filters: {
  month: string;
  from: string;
  to: string;
  type: string;
  accountId: string;
  cardId: string;
  categoryId: string;
}) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => value && searchParams.set(key, value));
  const response = await fetch(`/api/reports/summary?${searchParams.toString()}`, { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar relatorio", method: "GET", path: "/api/reports/summary" });
  if (!response.ok) throw new Error("Falha ao carregar relatório");
  return (await response.json()) as ReportResponse;
}

export function ReportsClient() {
  const searchParams = useSearchParams();
  const month = normalizeMonthKey(searchParams.get("month"));
  const monthLabel = formatMonthKeyLabel(month);
  const monthRange = useMemo(() => getMonthRange(month), [month]);
  const yearRange = useMemo(() => getYearRange(month), [month]);
  const [periodMode, setPeriodMode] = useState<"month" | "year">("month");
  const [filters, setFilters] = useState({ type: "", accountId: "", cardId: "", categoryId: "" });
  const deferredFilters = useDeferredValue(filters);
  const activeRange = useMemo(() => (periodMode === "year" ? yearRange : monthRange), [monthRange, periodMode, yearRange]);
  const effectiveFilters = useMemo(
    () => ({ month, from: activeRange.from, to: activeRange.to, ...deferredFilters }),
    [activeRange.from, activeRange.to, deferredFilters, month]
  );

  const accountsQuery = useQuery({ queryKey: ["accounts-options"], queryFn: () => getOptions<OptionItem>("/api/accounts"), staleTime: 30_000 });
  const cardsQuery = useQuery({ queryKey: ["cards-options"], queryFn: () => getOptions<OptionItem>(`/api/cards?month=${month}`), staleTime: 30_000 });
  const categoriesQuery = useQuery({ queryKey: ["categories-options"], queryFn: () => getOptions<OptionItem>("/api/categories"), staleTime: 30_000 });
  const reportsQuery = useQuery({
    queryKey: ["reports-summary", month, periodMode, effectiveFilters],
    queryFn: () => getReportSummary(effectiveFilters),
    staleTime: 15_000,
    placeholderData: (previousData) => previousData
  });

  const data = reportsQuery.data;
  const isYearScope = periodMode === "year";
  const periodLabel = periodMode === "year" ? formatYearLabel(month) : monthLabel;
  const annualAlerts = data?.annualInsights?.alerts ?? [];
  const monthlySeries = data?.monthly ?? [];
  const categoryData = useMemo(() => data?.byCategory ?? [], [data?.byCategory]);
  const byAccounts = data?.byAccount ?? [];
  const byCards = data?.byCard ?? [];
  const upcomingItems = data?.upcoming ?? [];
  const recentItems = data?.recent ?? [];
  const categoryBreakdown = data?.spendingInsights?.categoryBreakdown ?? [];
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const benefitSummary = data?.benefits;
  const selectedAccount = (accountsQuery.data ?? []).find((item) => item.id === filters.accountId);
  const selectedCard = (cardsQuery.data ?? []).find((item) => item.id === filters.cardId);
  const selectedCategory = (categoriesQuery.data ?? []).find((item) => item.id === filters.categoryId);
  const refinements = [
    filters.type ? (filters.type === "income" ? "Receitas" : filters.type === "expense" ? "Despesas" : "Transferências") : null,
    selectedAccount ? `Conta: ${selectedAccount.name}` : null,
    selectedCard ? `Cartão: ${selectedCard.name}` : null,
    selectedCategory ? `Categoria: ${selectedCategory.name}` : null
  ].filter(Boolean) as string[];
  const pdfHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("month", month);
    params.set("from", activeRange.from);
    params.set("to", activeRange.to);
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    return `/api/reports/pdf?${params.toString()}`;
  }, [activeRange.from, activeRange.to, filters, month]);
  const displayedCategoryIndex =
    categoryData.length === 0 ? 0 : Math.min(activeCategoryIndex, categoryData.length - 1);
  const activeCategory = categoryData[displayedCategoryIndex] ?? null;
  const leadingSeriesMonth =
    monthlySeries.reduce<MonthlySeriesItem | null>((best, item) => {
      const currentScore = Math.max(item.income, item.expense, Math.abs(item.balance ?? item.transfer));
      if (!best) {
        return item;
      }

      const bestScore = Math.max(best.income, best.expense, Math.abs(best.balance ?? best.transfer));
      return currentScore > bestScore ? item : best;
    }, null) ?? null;
  const strongestAccount =
    byAccounts.reduce<AccountItem | null>((best, item) => {
      if (!best) {
        return item;
      }

      return Math.abs(item.net) > Math.abs(best.net) ? item : best;
    }, null) ?? null;

  return (
    <div className="space-y-6">
      <section className="surface surface-strong hero-grid content-section">
        <div className="flex flex-col gap-8 xl:flex-row xl:items-start xl:justify-between">
          <div className="page-intro max-w-3xl">
            <div className="eyebrow">{isYearScope ? "Relatório anual" : "Relatórios"}</div>
            <h1 className="page-title">{data?.labels?.periodTitle ?? `Leitura financeira de ${periodLabel}`}</h1>
            <p className="max-w-3xl text-sm leading-7 text-white/80">
              {data?.labels?.periodSubtitle ?? "Use o mês ativo para uma leitura mensal ou o ano do mês ativo para um consolidado anual com comparativos."}
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/65">
              <span>{data?.labels?.scopeLabel ?? (isYearScope ? "Consolidado anual" : "Leitura mensal")}</span>
              <span>•</span>
              <span>{`Base: ${data?.labels?.baseMonthLabel ?? monthLabel}`}</span>
              <span>•</span>
              <span>{`${data?.summary?.transactions ?? 0} lançamentos`}</span>
            </div>
          </div>
          <div className="grid w-full gap-4 xl:max-w-[34rem] xl:grid-cols-2">
            <article className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Resultado</p>
              <p className={`hero-amount mt-3 ${amountClass(data?.summary?.balance ?? 0)}`}>{formatCurrency(data?.summary?.balance ?? 0)}</p>
              <p className="mt-3 text-sm text-white/70">{data?.annualInsights?.narrative?.summary ?? "Resultado consolidado do período."}</p>
            </article>
            <article className="rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Leitura executiva</p>
                  <p className="mt-3 text-lg font-semibold text-white">{data?.annualInsights?.narrative?.headline ?? "Aguardando leitura consolidada"}</p>
                </div>
                <div className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${toneBadgeClass(data?.annualInsights?.narrative?.tone ?? "attention")}`}>
                  {toneLabel(data?.annualInsights?.narrative?.tone ?? "attention")}
                </div>
              </div>
              <p className="mt-3 text-sm leading-6 text-white/70">{data?.annualInsights?.narrative?.focus ?? "Concentração, ritmo e pontos de pressão do período."}</p>
            </article>
          </div>
        </div>
        <div className="filter-shell mt-8">
          <p className="filter-kicker">Filtragem</p>
          <p className="filter-copy">
            Selecione os filtros do período para comparar resultados com mais clareza por competência, categorias,
            contas e cartões.
          </p>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="reports-period-mode">Escopo de leitura</Label>
            <Select id="reports-period-mode" value={periodMode} onChange={(event) => setPeriodMode(event.target.value as "month" | "year")}>
              <option value="month">Mês em foco</option>
              <option value="year">Ano do mês em foco</option>
            </Select>
          </div>
          <div className="space-y-2"><Label htmlFor="reports-filter-from">De</Label><DatePickerInput id="reports-filter-from" type="date" disabled readOnly value={activeRange.from} /></div>
          <div className="space-y-2"><Label htmlFor="reports-filter-to">Até</Label><DatePickerInput id="reports-filter-to" type="date" disabled readOnly value={activeRange.to} /></div>
          <div className="space-y-2">
            <Label htmlFor="reports-filter-type">Tipo</Label>
            <Select id="reports-filter-type" value={filters.type} onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}>
              <option value="">Todos os tipos</option><option value="income">Receita</option><option value="expense">Despesa</option><option value="transfer">Transferência</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reports-filter-account">Conta</Label>
            <Select id="reports-filter-account" value={filters.accountId} onChange={(event) => setFilters((current) => ({ ...current, accountId: event.target.value }))}>
              <option value="">Todas as contas</option>{(accountsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reports-filter-card">Cartão</Label>
            <Select id="reports-filter-card" value={filters.cardId} onChange={(event) => setFilters((current) => ({ ...current, cardId: event.target.value }))}>
              <option value="">Todos os cartões</option>{(cardsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reports-filter-category">Categoria</Label>
            <Select id="reports-filter-category" value={filters.categoryId} onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}>
              <option value="">Todas as categorias</option>{(categoriesQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap items-end gap-3 md:col-span-2 xl:col-span-3 2xl:col-span-4">
            <Button onClick={() => setFilters({ type: "", accountId: "", cardId: "", categoryId: "" })} type="button" variant="ghost">Limpar leitura</Button>
            {data?.license?.features?.pdfExport ? <Button asChild><a href={pdfHref} target="_blank">Abrir PDF do resumo</a></Button> : <Button disabled type="button" variant="secondary">PDF disponível no Premium</Button>}
          </div>
        </div>
        <div className="muted-panel mt-4 flex flex-wrap items-start justify-between gap-3 text-sm">
          <p className="filter-summary-meta shrink-0">{`Base de leitura: ${monthLabel} • Janela ativa: ${periodLabel}.`}</p>
          <p className="filter-summary-copy min-w-0 flex-1 break-words text-left sm:text-right">{refinements.length > 0 ? refinements.join(" • ") : "Sem recortes adicionais no momento."}</p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="metric-card motion-card"><p className="metric-label">Resultado do período</p><p className={`metric-value amount-nowrap ${amountClass(data?.summary?.balance ?? 0)}`}>{formatCurrency(data?.summary?.balance ?? 0)}</p><p className="metric-footnote">{`Taxa de economia: ${formatSavingsRate(data?.summary?.savingsRate ?? 0, data?.summary?.income ?? 0)}`}</p></article>
        <article className="metric-card motion-card"><p className="metric-label">Saldo inicial</p><p className={`metric-value amount-nowrap ${amountClass(data?.periodBalances?.opening ?? 0)}`}>{formatCurrency(data?.periodBalances?.opening ?? 0)}</p><p className="metric-footnote">Caixa consolidado no início do recorte.</p></article>
        <article className="metric-card motion-card"><p className="metric-label">Saldo final</p><p className={`metric-value amount-nowrap ${amountClass(data?.periodBalances?.closing ?? 0)}`}>{formatCurrency(data?.periodBalances?.closing ?? 0)}</p><p className="metric-footnote">Caixa consolidado no fim do período.</p></article>
        <article className="metric-card motion-card"><p className="metric-label">{isYearScope ? "Média mensal de resultado" : "Despesa média diária"}</p><p className={`metric-value amount-nowrap ${amountClass(isYearScope ? data?.annualInsights?.cadence?.averageMonthlyBalance ?? 0 : -(data?.summary?.averageDailyExpense ?? 0))}`}>{formatCurrency(isYearScope ? data?.annualInsights?.cadence?.averageMonthlyBalance ?? 0 : data?.summary?.averageDailyExpense ?? 0)}</p><p className="metric-footnote">{isYearScope ? `${data?.annualInsights?.cadence?.positiveMonths ?? 0} meses positivos de ${data?.period?.months ?? 0}.` : "Saída média por dia no período."}</p></article>
      </div>

      {(benefitSummary?.foodWallets ?? 0) > 0 ? (
        <section className="surface motion-card content-section">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Vale Alimentação</h2>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                Saldo atual das carteiras de benefício e o fluxo registrado no período.
              </p>
            </div>
            <p className="text-sm font-medium text-[var(--color-primary)]">
              {benefitSummary?.foodWallets ?? 0} carteiras ativas
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <article className="data-card motion-card p-4"><p className="metric-label">Saldo disponível</p><p className={`subtle-metric-value amount-nowrap mt-3 ${amountClass(benefitSummary?.foodBalance ?? 0)}`}>{formatCurrency(benefitSummary?.foodBalance ?? 0)}</p><p className="mt-2 text-sm text-[var(--color-muted-foreground)]">Saldo somado das carteiras de Vale Alimentação.</p></article>
            <article className="data-card motion-card p-4"><p className="metric-label">Créditos no período</p><p className="subtle-metric-value amount-nowrap mt-3 amount-positive">{formatCurrency(benefitSummary?.foodIncome ?? 0)}</p><p className="mt-2 text-sm text-[var(--color-muted-foreground)]">Entradas lançadas na carteira de benefício.</p></article>
            <article className="data-card motion-card p-4"><p className="metric-label">Consumo no período</p><p className="subtle-metric-value amount-nowrap mt-3 amount-negative">{formatCurrency(benefitSummary?.foodExpense ?? 0)}</p><p className="mt-2 text-sm text-[var(--color-muted-foreground)]">Despesas elegíveis de alimentação consumidas no recorte.</p></article>
          </div>
        </section>
      ) : null}

      {isYearScope ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="surface motion-card content-section">
            <h2 className="text-xl font-semibold">Narrativa anual</h2>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <article className={`rounded-[1.5rem] border p-5 ${tonePanelClass(data?.annualInsights?.narrative?.tone ?? "attention")}`}>
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.14em]">Resumo executivo</p><h3 className="mt-3 text-xl font-semibold">{data?.annualInsights?.narrative?.headline ?? "Leitura anual indisponível"}</h3></div><Sparkles className="mt-1 size-5" /></div>
                <p className="mt-4 text-sm leading-7">{data?.annualInsights?.narrative?.summary ?? "Sem síntese disponível."}</p><p className="mt-3 text-sm leading-7">{data?.annualInsights?.narrative?.focus ?? "Sem foco definido."}</p>
              </article>
              <div className="space-y-3">
                {annualAlerts.length ? annualAlerts.map((item, index: number) => <article key={`${item.title}-${index}`} className={`rounded-[1.35rem] border px-4 py-4 ${toneBadgeClass(item.tone)}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.title}</p><p className="mt-2 text-sm leading-6">{item.detail}</p></div><AlertTriangle className="mt-1 size-4 shrink-0" /></div></article>) : <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">Nenhum alerta relevante foi identificado para o ano analisado.</div>}
              </div>
            </div>
          </section>
          <section className="surface motion-card content-section">
            <h2 className="text-xl font-semibold">Cadência e concentração</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <article className="data-card motion-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="metric-label">Meses ativos</p><p className="subtle-metric-value mt-3">{`${data?.annualInsights?.cadence?.activeMonths ?? 0}/${data?.period?.months ?? 0}`}</p></div><CalendarRange className="size-4" /></div><p className="mt-3 text-sm text-[var(--color-muted-foreground)]">{`${data?.annualInsights?.cadence?.positiveMonths ?? 0} positivos • ${data?.annualInsights?.cadence?.negativeMonths ?? 0} negativos • ${data?.annualInsights?.cadence?.neutralMonths ?? 0} neutros`}</p></article>
              <article className="data-card motion-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="metric-label">Top 3 categorias</p><p className="subtle-metric-value mt-3">{pct(data?.annualInsights?.concentration?.topCategoriesShare ?? 0)}</p></div><TrendingDown className="size-4" /></div><p className="mt-3 text-sm text-[var(--color-muted-foreground)]">Concentração das maiores despesas sobre o total anual.</p></article>
              <article className="data-card motion-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="metric-label">Sem categoria</p><p className="subtle-metric-value mt-3">{pct(data?.annualInsights?.concentration?.uncategorizedExpenseShare ?? 0)}</p></div><AlertTriangle className="size-4" /></div><p className="mt-3 text-sm text-[var(--color-muted-foreground)]">{formatCurrency(data?.summary?.uncategorizedExpense ?? 0)}</p></article>
              <article className="data-card motion-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="metric-label">Amplitude anual</p><p className="subtle-metric-value mt-3">{formatCurrency(data?.annualInsights?.cadence?.balanceSpread ?? 0)}</p></div><TrendingUp className="size-4" /></div><p className="mt-3 text-sm text-[var(--color-muted-foreground)]">Diferença entre o melhor e o pior mês em saldo.</p></article>
            </div>
          </section>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="surface motion-card content-section">
          <h2 className="text-xl font-semibold">{isYearScope ? "Receitas, despesas e saldo mensal" : "Receitas, despesas e transferências"}</h2>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-[var(--color-muted-foreground)]">
            {leadingSeriesMonth ? (
              <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5">
                Pico do período em <span className="font-semibold text-[var(--color-foreground)]">{leadingSeriesMonth.label}</span>
              </div>
            ) : null}
            {strongestAccount ? (
              <div className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5">
                Conta mais intensa: <span className={`font-semibold ${amountClass(strongestAccount.net)}`}>{strongestAccount.name}</span>
              </div>
            ) : null}
          </div>
          <DeferredResponsiveChart>
            <BarChart data={monthlySeries}>
              <CartesianGrid stroke="rgba(69,82,70,0.08)" vertical={false} />
              <XAxis axisLine={false} dataKey="label" tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} tickLine={false} tickMargin={12} />
              <YAxis axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} tickFormatter={(value: number) => formatCurrency(value).replace("R$ ", "R$")} tickLine={false} width={94} />
              <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(19,111,79,0.08)" }} />
              <Bar
                dataKey="income"
                name="Receitas"
                fill="#1F8F62"
                radius={[8, 8, 0, 0]}
                animationDuration={900}
                animationEasing="ease-out"
                activeBar={{ fill: "#27a773", stroke: "rgba(255,255,255,0.22)", strokeWidth: 1 }}
              />
              <Bar
                dataKey="expense"
                name="Despesas"
                fill="#DB6B4D"
                radius={[8, 8, 0, 0]}
                animationBegin={120}
                animationDuration={950}
                animationEasing="ease-out"
                activeBar={{ fill: "#e77d60", stroke: "rgba(255,255,255,0.22)", strokeWidth: 1 }}
              />
              <Bar
                dataKey={isYearScope ? "balance" : "transfer"}
                name={isYearScope ? "Saldo" : "Transferências"}
                fill={isYearScope ? "#3B82F6" : "#B9851B"}
                radius={[8, 8, 0, 0]}
                animationBegin={220}
                animationDuration={1000}
                animationEasing="ease-out"
                activeBar={{
                  fill: isYearScope ? "#5a9cff" : "#cc9a29",
                  stroke: "rgba(255,255,255,0.22)",
                  strokeWidth: 1
                }}
              />
            </BarChart>
          </DeferredResponsiveChart>
        </section>
        <section className="surface motion-card content-section">
          <h2 className="text-xl font-semibold">Despesas por categoria</h2>
          {activeCategory ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div>
                <p className="text-sm text-[var(--color-muted-foreground)]">Categoria em destaque</p>
                <p className="mt-2 text-2xl font-semibold text-[var(--color-foreground)]">{activeCategory.name}</p>
                <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                  {activeCategory.items} lançamentos • {categoryShareLabel(activeCategory.share)} do total de despesas
                </p>
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-white/6 px-4 py-3 text-right shadow-[0_18px_40px_-24px_rgba(31,143,98,0.55)]">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/55">Volume</p>
                <p className="mt-2 text-xl font-semibold amount-negative">{formatCurrency(activeCategory.total)}</p>
              </div>
            </div>
          ) : null}
          <DeferredResponsiveChart>
            <PieChart>
              <defs>
                {chartGlowPalette.map((color, index) => (
                  <filter key={`chart-glow-${index}`} id={`chart-glow-${index}`} x="-40%" y="-40%" width="180%" height="180%">
                    <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor={color} />
                  </filter>
                ))}
              </defs>
              <Pie
                data={categoryData}
                dataKey="total"
                nameKey="name"
                innerRadius={72}
                outerRadius={116}
                paddingAngle={3}
                onMouseEnter={(_, index) => setActiveCategoryIndex(index)}
                animationDuration={1100}
                animationEasing="ease-out"
              >
                {categoryData.map((entry, index: number) => (
                  <Cell
                    key={entry.name}
                    fill={palette[index % palette.length]}
                    stroke="rgba(255,255,255,0.14)"
                    strokeWidth={index === displayedCategoryIndex ? 2 : 1}
                    style={{
                      filter: `url(#chart-glow-${index % chartGlowPalette.length})`,
                      opacity: index === displayedCategoryIndex ? 1 : 0.72,
                      cursor: "pointer"
                    }}
                  />
                ))}
              </Pie>
              {activeCategory ? (
                <>
                  <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" fill="rgba(214,199,172,0.8)" fontSize="12">
                    Explorando
                  </text>
                  <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle" fill="var(--color-foreground)" fontSize="18" fontWeight="600">
                    {activeCategory.name}
                  </text>
                  <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle" fill={palette[displayedCategoryIndex % palette.length]} fontSize="16" fontWeight="700">
                    {formatCurrency(activeCategory.total)}
                  </text>
                </>
              ) : null}
              <Tooltip content={<ChartTooltipContent />} />
            </PieChart>
          </DeferredResponsiveChart>
          {categoryData.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {categoryData.slice(0, 6).map((item, index) => {
                const isActive = index === displayedCategoryIndex;

                return (
                  <button
                    key={`category-chip-${item.name}`}
                    type="button"
                    onMouseEnter={() => setActiveCategoryIndex(index)}
                    onFocus={() => setActiveCategoryIndex(index)}
                    onClick={() => setActiveCategoryIndex(index)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition duration-200 ${
                      isActive
                        ? "border-white/20 bg-white/12 text-[var(--color-foreground)] shadow-[0_14px_30px_-18px_rgba(255,255,255,0.45)]"
                        : "border-white/8 bg-white/5 text-[var(--color-muted-foreground)] hover:border-white/16 hover:bg-white/9"
                    }`}
                  >
                    <span className="mr-2 inline-block size-2 rounded-full align-middle" style={{ backgroundColor: palette[index % palette.length] }} />
                    {item.name}
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="surface motion-card content-section">
          <h2 className="text-xl font-semibold">{isYearScope ? "Destaques do ano" : "Leitura de gasto"}</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <article className="data-card motion-card p-4"><p className="metric-label">{isYearScope ? "Melhor mês" : "Maior categoria"}</p><p className="mt-3 text-base font-semibold">{isYearScope ? data?.annualInsights?.highlights?.bestMonth?.label ?? "Sem dados" : data?.spendingInsights?.topCategory?.name ?? "Sem dados"}</p><p className={`mt-2 text-sm ${isYearScope ? amountClass(data?.annualInsights?.highlights?.bestMonth?.balance ?? 0) : "text-[var(--color-muted-foreground)]"}`}>{isYearScope ? formatCurrency(data?.annualInsights?.highlights?.bestMonth?.balance ?? 0) : data?.spendingInsights?.topCategory ? `${formatCurrency(data.spendingInsights.topCategory.total)} • ${pct(data.spendingInsights.topCategory.share)} das despesas` : "Ainda não há dados suficientes."}</p></article>
            <article className="data-card motion-card p-4"><p className="metric-label">{isYearScope ? "Pior mês" : "Essenciais"}</p><p className="mt-3 text-base font-semibold">{isYearScope ? data?.annualInsights?.highlights?.worstMonth?.label ?? "Sem dados" : formatCurrency(data?.spendingInsights?.essentialExpenses ?? 0)}</p><p className={`mt-2 text-sm ${isYearScope ? amountClass(data?.annualInsights?.highlights?.worstMonth?.balance ?? 0) : "text-[var(--color-muted-foreground)]"}`}>{isYearScope ? formatCurrency(data?.annualInsights?.highlights?.worstMonth?.balance ?? 0) : "Moradia, saúde, utilidades e despesas estruturais."}</p></article>
            <article className="data-card motion-card p-4"><p className="metric-label">{isYearScope ? "Melhor trimestre" : "Estilo de vida"}</p><p className="mt-3 text-base font-semibold">{isYearScope ? data?.annualInsights?.highlights?.strongestQuarter?.label ?? "Sem dados" : formatCurrency(data?.spendingInsights?.lifestyleExpenses ?? 0)}</p><p className={`mt-2 text-sm ${isYearScope ? amountClass(data?.annualInsights?.highlights?.strongestQuarter?.balance ?? 0) : "text-[var(--color-muted-foreground)]"}`}>{isYearScope ? formatCurrency(data?.annualInsights?.highlights?.strongestQuarter?.balance ?? 0) : "Consumo flexível como lazer, delivery, viagens e streaming."}</p></article>
            <article className="data-card motion-card p-4"><p className="metric-label">{isYearScope ? "Trimestre mais fraco" : "Transferências no fluxo"}</p><p className="mt-3 text-base font-semibold">{isYearScope ? data?.annualInsights?.highlights?.weakestQuarter?.label ?? "Sem dados" : pct(data?.comparison?.transferShare ?? 0)}</p><p className={`mt-2 text-sm ${isYearScope ? amountClass(data?.annualInsights?.highlights?.weakestQuarter?.balance ?? 0) : "text-[var(--color-muted-foreground)]"}`}>{isYearScope ? formatCurrency(data?.annualInsights?.highlights?.weakestQuarter?.balance ?? 0) : "Peso das transferências na movimentação total."}</p></article>
          </div>
        </section>
        <section className="surface motion-card content-section">
          <h2 className="text-xl font-semibold">Movimentação por conta</h2>
          <div className="mt-6 space-y-3">{byAccounts.length ? byAccounts.slice(0, 8).map((item) => <article key={item.id} className="data-card motion-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="break-words font-semibold">{item.usage === "benefit_food" ? `${item.name} • vale alimentação` : item.name}</p><p className="break-words text-sm text-[var(--color-muted-foreground)]">{`Entradas ${formatCurrency(item.income)} • Saídas ${formatCurrency(item.expense)}`}</p></div><p className={`amount-nowrap w-full text-left font-semibold sm:w-auto sm:text-right ${amountClass(item.net)}`}>{formatCurrency(item.net)}</p></div></article>) : <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">Nenhuma conta com impacto financeiro foi encontrada neste filtro.</div>}</div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="surface motion-card content-section">
          <h2 className="text-xl font-semibold">{isYearScope ? "Cartões com maior impacto" : "Controle por cartão"}</h2>
          <div className="mt-6 space-y-3">
            {byCards.length ? (
              byCards.slice(0, 8).map((item) => (
                <article key={item.id} className="data-card motion-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{item.name}</p>
                      <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                        {item.brand} • {item.transactions} lançamentos • Estorno {formatCurrency(item.refunds)}
                      </p>
                    </div>
                    <p className={`amount-nowrap w-full text-left font-semibold sm:w-auto sm:text-right ${amountClass(item.netStatement)}`}>
                      {formatCurrency(item.netStatement)}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
                Nenhum lançamento em cartão foi encontrado neste filtro.
              </div>
            )}
          </div>
        </section>

        <section className="surface motion-card content-section">
          <h2 className="text-xl font-semibold">{isYearScope ? "Próximos compromissos e projeções" : "Compromissos do período"}</h2>
          <div className="mt-6 space-y-3">
            {upcomingItems.length ? (
              upcomingItems.map((item) => (
                <article key={`${item.source}-${item.reference}`} className="data-card motion-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{item.label}</p>
                      <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                        {formatDateDisplay(item.date)} •{" "}
                        {item.source === "subscription"
                          ? "Recorrência"
                          : item.source === "card_statement"
                            ? "Fatura do cartão"
                            : "Prazo de meta"}
                      </p>
                    </div>
                    <p className={`amount-nowrap w-full text-left font-semibold sm:w-auto sm:text-right ${item.type === "income" ? "text-[var(--color-primary)]" : "amount-negative"}`}>
                      {formatCurrency(item.amount)}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
                {`Nenhum vencimento relevante foi encontrado em ${periodLabel}.`}
              </div>
            )}
          </div>
        </section>
      </div>

        <section className="surface motion-card content-section">
        <h2 className="text-xl font-semibold">Movimentações recentes</h2>
        <div className="mt-6 space-y-3">{recentItems.map((item) => <article key={item.id} className="data-card motion-card p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="break-words font-semibold">{item.description}</p><p className="break-words text-sm text-[var(--color-muted-foreground)]">{item.type === "transfer" ? "Transferência entre contas" : item.category} • {formatDateDisplay(item.date)}</p><p className="break-words text-sm text-[var(--color-muted-foreground)]">{item.card ?? item.account ?? "Sem origem"}{item.destinationAccount ? ` → ${item.destinationAccount}` : ""}</p></div><p className={`amount-nowrap w-full text-left font-semibold sm:w-auto sm:text-right ${item.type === "expense" ? "amount-negative" : item.type === "income" ? "amount-positive" : "text-[var(--color-foreground)]"}`}>{formatCurrency(item.amount)}</p></div></article>)}</div>
      </section>

      <section className="surface motion-card content-section">
        <h2 className="text-xl font-semibold">{isYearScope ? "Mapa anual de categorias" : "Mapa de categorias"}</h2>
        <div className="mt-6 space-y-3">
          {categoryBreakdown.length ? (
            categoryBreakdown.map((item) => (
              <article key={item.name} className="data-card motion-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{item.name}</p>
                    <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                      {item.items} lançamentos • {pct(item.share)} do total de despesas
                    </p>
                  </div>
                  <p className="amount-nowrap w-full text-left font-semibold amount-negative sm:w-auto sm:text-right">
                    {formatCurrency(item.total)}
                  </p>
                </div>
              </article>
            ))
          ) : (
            <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
              Ainda não há categorias suficientes para leitura detalhada neste período.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
