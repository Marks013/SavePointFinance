"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";

import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDateDisplay } from "@/lib/date";
import { formatMonthKeyLabel, getMonthRange, normalizeMonthKey } from "@/lib/month";
import { formatCurrency } from "@/lib/utils";

type ReportResponse = {
  isPlatformAdmin: boolean;
  license: {
    plan: "free" | "pro";
    planLabel: string;
    status: string;
    statusLabel: string;
    features: {
      whatsappAssistant: boolean;
      automation: boolean;
      pdfExport: boolean;
    };
  };
  summary: {
    income: number;
    expense: number;
    balance: number;
    transfer: number;
    transactions: number;
    averageDailyExpense: number;
    savingsRate: number;
    uncategorizedExpense: number;
  };
  classification: {
    autoClassified: number;
    uncategorized: number;
    coverage: number;
  };
  spendingInsights: {
    topCategory: {
      id: string | null;
      name: string;
      total: number;
      items: number;
      share: number;
    } | null;
    essentialExpenses: number;
    lifestyleExpenses: number;
    categoryBreakdown: Array<{
      id: string | null;
      name: string;
      total: number;
      items: number;
      share: number;
    }>;
  };
  projection: {
    horizonDays: number;
    currentBalance: number;
    income: number;
    expense: number;
    cardPayments: number;
    net: number;
    endingBalance: number;
  };
  periodBalances: {
    opening: number;
    closing: number;
    net: number;
  };
  filters: {
    from?: string | null;
    to?: string | null;
    type?: string | null;
    accountId?: string | null;
    cardId?: string | null;
    categoryId?: string | null;
  };
  monthly: Array<{
    label: string;
    income: number;
    expense: number;
    transfer: number;
  }>;
  byCategory: Array<{
    id: string | null;
    name: string;
    total: number;
    items: number;
    share: number;
  }>;
  byAccount: Array<{
    id: string;
    name: string;
    income: number;
    expense: number;
    transferIn: number;
    transferOut: number;
    net: number;
  }>;
  byCard: Array<{
    id: string;
    name: string;
    brand: string;
    spent: number;
    refunds: number;
    netStatement: number;
    transactions: number;
  }>;
  upcoming: Array<{
    date: string;
    label: string;
    amount: number;
    type: "income" | "expense";
    source: "subscription" | "card_statement" | "goal_deadline";
    reference: string;
  }>;
  recent: Array<{
    id: string;
    description: string;
    amount: number;
    type: string;
    date: string;
    category: string;
    account: string | null;
    destinationAccount: string | null;
    card: string | null;
  }>;
};

type OptionItem = {
  id: string;
  name: string;
};

const palette = ["#1F8F62", "#DB6B4D", "#3B82F6", "#B9851B", "#0F766E", "#7A8F44"];

function ChartTooltipContent({
  active,
  payload,
  label
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }

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
            <span className={`font-medium ${Number(item.value ?? 0) < 0 ? "amount-negative" : "text-[var(--color-foreground)]"}`}>{formatCurrency(Number(item.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

async function getOptions<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar opções");
  const data = (await response.json()) as { items: T[] };
  return data.items;
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
  if (filters.month) searchParams.set("month", filters.month);
  if (filters.from) searchParams.set("from", filters.from);
  if (filters.to) searchParams.set("to", filters.to);
  if (filters.type) searchParams.set("type", filters.type);
  if (filters.accountId) searchParams.set("accountId", filters.accountId);
  if (filters.cardId) searchParams.set("cardId", filters.cardId);
  if (filters.categoryId) searchParams.set("categoryId", filters.categoryId);

  const response = await fetch(`/api/reports/summary?${searchParams.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar relatório");
  return (await response.json()) as ReportResponse;
}

export function ReportsClient() {
  const searchParams = useSearchParams();
  const month = normalizeMonthKey(searchParams.get("month"));
  const monthLabel = formatMonthKeyLabel(month);
  const monthRange = useMemo(() => getMonthRange(month), [month]);
  const [filters, setFilters] = useState({
    type: "",
    accountId: "",
    cardId: "",
    categoryId: ""
  });
  const effectiveFilters = useMemo(
    () => ({
      month,
      from: monthRange.from,
      to: monthRange.to,
      type: filters.type,
      accountId: filters.accountId,
      cardId: filters.cardId,
      categoryId: filters.categoryId
    }),
    [filters.accountId, filters.cardId, filters.categoryId, filters.type, month, monthRange.from, monthRange.to]
  );
  const accountsQuery = useQuery({
    queryKey: ["accounts-options"],
    queryFn: () => getOptions<OptionItem>("/api/accounts"),
    staleTime: 30_000
  });
  const cardsQuery = useQuery({
    queryKey: ["cards-options"],
    queryFn: () => getOptions<OptionItem>(`/api/cards?month=${month}`),
    staleTime: 30_000
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories-options"],
    queryFn: () => getOptions<OptionItem>("/api/categories"),
    staleTime: 30_000
  });
  const reportsQuery = useQuery({
    queryKey: ["reports-summary", month, filters],
    queryFn: () => getReportSummary(effectiveFilters),
    staleTime: 15_000,
    placeholderData: (previousData) => previousData
  });
  const data = reportsQuery.data;
  const selectedReportAccount = (accountsQuery.data ?? []).find((item) => item.id === filters.accountId);
  const selectedReportCard = (cardsQuery.data ?? []).find((item) => item.id === filters.cardId);
  const selectedReportCategory = (categoriesQuery.data ?? []).find((item) => item.id === filters.categoryId);
  const activeRefinements = [
    filters.type
      ? filters.type === "income"
        ? "Receitas"
        : filters.type === "expense"
          ? "Despesas"
          : "Transferências"
      : null,
    selectedReportAccount ? `Conta: ${selectedReportAccount.name}` : null,
    selectedReportCard ? `Cartão: ${selectedReportCard.name}` : null,
    selectedReportCategory ? `Categoria: ${selectedReportCategory.name}` : null
  ].filter(Boolean) as string[];
  const pdfHref = useMemo(() => {
    const searchParams = new URLSearchParams();
    searchParams.set("month", month);
    searchParams.set("from", monthRange.from);
    searchParams.set("to", monthRange.to);
    if (filters.type) searchParams.set("type", filters.type);
    if (filters.accountId) searchParams.set("accountId", filters.accountId);
    if (filters.cardId) searchParams.set("cardId", filters.cardId);
    if (filters.categoryId) searchParams.set("categoryId", filters.categoryId);
    const query = searchParams.toString();
    return query ? `/api/reports/pdf?${query}` : "/api/reports/pdf";
  }, [filters, month, monthRange.from, monthRange.to]);

  return (
    <div className="space-y-6">
      <section className="surface content-section">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="page-intro">
            <div className="eyebrow">Relatórios</div>
            <h1 className="text-3xl font-semibold tracking-[-0.04em]">{`Leitura financeira de ${monthLabel}`}</h1>
            <p className="text-sm leading-7 text-[var(--color-muted-foreground)]">
              A competência mensal vem da navegação global. Os filtros abaixo refinam a leitura apenas dentro deste mês.
            </p>
            {data?.isPlatformAdmin ? (
              <p className="attention-copy mt-3 text-sm">
                Superadmin ignora restrições de plano neste ambiente. Para validar o bloqueio de PDF, use uma conta
                comum vinculada a outro perfil.
              </p>
            ) : null}
          </div>
          {data?.license.features.pdfExport ? (
            <Button asChild>
              <a href={pdfHref} target="_blank">
                Abrir PDF do resumo
              </a>
            </Button>
          ) : (
            <Button disabled type="button" variant="secondary">
              PDF disponível no Premium
            </Button>
          )}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <div className="space-y-2">
            <Label htmlFor="reports-filter-from">De</Label>
            <DatePickerInput
              id="reports-filter-from"
              type="date"
              disabled
              readOnly
              value={monthRange.from}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reports-filter-to">Até</Label>
            <DatePickerInput
              id="reports-filter-to"
              type="date"
              disabled
              readOnly
              value={monthRange.to}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reports-filter-type">Tipo</Label>
            <Select
              id="reports-filter-type"
              value={filters.type}
              onChange={(event) => setFilters((current) => ({ ...current, type: event.target.value }))}
            >
              <option value="">Todos</option>
              <option value="income">Receita</option>
              <option value="expense">Despesa</option>
              <option value="transfer">Transferência</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reports-filter-account">Conta</Label>
            <Select
              id="reports-filter-account"
              value={filters.accountId}
              onChange={(event) => setFilters((current) => ({ ...current, accountId: event.target.value }))}
            >
              <option value="">Todas</option>
              {(accountsQuery.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reports-filter-card">Cartão</Label>
            <Select
              id="reports-filter-card"
              value={filters.cardId}
              onChange={(event) => setFilters((current) => ({ ...current, cardId: event.target.value }))}
            >
              <option value="">Todos os cartões</option>
              {(cardsQuery.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reports-filter-category">Categoria</Label>
            <Select
              id="reports-filter-category"
              value={filters.categoryId}
              onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}
            >
              <option value="">Todas</option>
              {(categoriesQuery.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex items-end md:col-span-2 xl:col-span-3 2xl:col-span-1">
            <Button
              onClick={() => setFilters({ type: "", accountId: "", cardId: "", categoryId: "" })}
              type="button"
              variant="ghost"
            >
              Limpar refinamentos
            </Button>
          </div>
        </div>
        <div className="muted-panel mt-4 flex flex-wrap items-start justify-between gap-3 text-sm text-[var(--color-muted-foreground)]">
          <p className="shrink-0">{`Mês ativo: ${monthLabel}.`}</p>
          <p className="min-w-0 flex-1 break-words text-left sm:text-right">
            {activeRefinements.length > 0 ? activeRefinements.join(" • ") : "Sem refinamentos adicionais."}
          </p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="metric-card">
          <p className="metric-label">Resultado do período</p>
          <p className={`metric-value ${(data?.summary.balance ?? 0) < 0 ? "amount-negative" : "amount-positive"}`}>
            {formatCurrency(data?.summary.balance ?? 0)}
          </p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Receitas do período</p>
          <p className="metric-value amount-positive">{formatCurrency(data?.summary.income ?? 0)}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Despesas do período</p>
          <p className="metric-value amount-negative">{formatCurrency(data?.summary.expense ?? 0)}</p>
        </article>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="metric-card">
          <p className="metric-label">Saldo inicial do mês</p>
          <p className={`metric-value ${(data?.periodBalances.opening ?? 0) < 0 ? "amount-negative" : "amount-positive"}`}>
            {formatCurrency(data?.periodBalances.opening ?? 0)}
          </p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Variação real nas contas</p>
          <p className={`metric-value ${(data?.periodBalances.net ?? 0) < 0 ? "amount-negative" : "amount-positive"}`}>
            {formatCurrency(data?.periodBalances.net ?? 0)}
          </p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Saldo final do mês</p>
          <p className={`metric-value ${(data?.periodBalances.closing ?? 0) < 0 ? "amount-negative" : "amount-positive"}`}>
            {formatCurrency(data?.periodBalances.closing ?? 0)}
          </p>
        </article>
      </div>

      <div className="muted-panel flex flex-wrap items-start justify-between gap-3 text-sm text-[var(--color-muted-foreground)]">
        <p className="min-w-0 flex-1 break-words">
          Resultado do período segue a competência financeira. Saldos inicial e final usam o caixa real das contas nas
          datas registradas, então podem divergir quando compras no cartão ainda não viraram pagamento.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="surface content-section">
          <h2 className="text-xl font-semibold">Receitas, despesas e competência</h2>
          <div className="mt-6 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.monthly ?? []}>
                <CartesianGrid stroke="rgba(69,82,70,0.08)" vertical={false} />
                <XAxis axisLine={false} dataKey="label" tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} tickLine={false} tickMargin={12} />
                <YAxis axisLine={false} tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }} tickFormatter={(value: number) => formatCurrency(value).replace("R$ ", "R$")} tickLine={false} width={94} />
                <Tooltip content={<ChartTooltipContent />} cursor={{ fill: "rgba(19,111,79,0.08)" }} />
                <Bar dataKey="income" fill="#1F8F62" radius={[8, 8, 0, 0]} />
                <Bar dataKey="expense" fill="#DB6B4D" radius={[8, 8, 0, 0]} />
                <Bar dataKey="transfer" fill="#B9851B" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="surface content-section">
          <h2 className="text-xl font-semibold">Despesas por categoria</h2>
          <div className="mt-6 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data?.byCategory ?? []} dataKey="total" nameKey="name" innerRadius={64} outerRadius={110}>
                  {(data?.byCategory ?? []).map((entry, index) => (
                    <Cell key={entry.name} fill={palette[index % palette.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltipContent />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="surface content-section">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Leitura de gasto</h2>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                {`Síntese para entender peso de gastos fixos, estilo de vida e maior pressão dentro de ${monthLabel}.`}
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <article className="data-card p-4">
              <p className="metric-label">Maior categoria</p>
              <p className="mt-3 text-base font-semibold">{data?.spendingInsights.topCategory?.name ?? "Sem dados"}</p>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                {data?.spendingInsights.topCategory
                  ? `${formatCurrency(data.spendingInsights.topCategory.total)} • ${Math.round(
                      data.spendingInsights.topCategory.share * 100
                    )}% das despesas`
                  : "Ainda não há dados suficientes no filtro atual."}
              </p>
            </article>
            <article className="data-card p-4">
              <p className="metric-label">Essenciais</p>
              <p className="mt-3 text-base font-semibold">{formatCurrency(data?.spendingInsights.essentialExpenses ?? 0)}</p>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                Moradia, saúde, utilidades e despesas estruturais.
              </p>
            </article>
            <article className="data-card p-4">
              <p className="metric-label">Estilo de vida</p>
              <p className="mt-3 text-base font-semibold">{formatCurrency(data?.spendingInsights.lifestyleExpenses ?? 0)}</p>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                Consumo flexível como lazer, delivery, viagens e streaming.
              </p>
            </article>
          </div>
        </section>

        <section className="surface content-section">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">Movimentação por conta</h2>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                Impacto líquido do período por conta, considerando entradas, saídas e transferências.
              </p>
            </div>
            <p className="text-sm font-medium text-[var(--color-muted-foreground)]">
              {data?.summary.transactions ?? 0} lançamentos
            </p>
          </div>
          <div className="mt-6 space-y-3">
            {(data?.byAccount ?? []).length ? (
              data?.byAccount.slice(0, 8).map((item) => (
                <article key={item.id} className="data-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{item.name}</p>
                      <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                        Entradas {formatCurrency(item.income)} • Saídas {formatCurrency(item.expense)}
                      </p>
                    </div>
                    <p
                      className={`w-full break-words text-left font-semibold sm:w-auto sm:text-right ${
                        item.net >= 0 ? "text-[var(--color-emerald-600)]" : "amount-negative"
                      }`}
                    >
                      {formatCurrency(item.net)}
                    </p>
                  </div>
                </article>
              ))
            ) : (
              <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
                Nenhuma conta com impacto financeiro foi encontrada neste filtro.
              </div>
            )}
          </div>
        </section>

        <section className="surface content-section">
          <h2 className="text-xl font-semibold">Controle por cartão</h2>
          <div className="mt-6 space-y-3">
            {(data?.byCard ?? []).length ? (
              data?.byCard.slice(0, 8).map((item) => (
                <article key={item.id} className="data-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{item.name}</p>
                      <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                        {item.brand} • {item.transactions} lançamentos • Estorno {formatCurrency(item.refunds)}
                      </p>
                    </div>
                    <p className={`w-full break-words text-left font-semibold sm:w-auto sm:text-right ${item.netStatement < 0 ? "amount-negative" : "amount-positive"}`}>
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
      </div>

      <section className="surface content-section">
        <h2 className="text-xl font-semibold">Movimentações recentes</h2>
        <div className="mt-6 space-y-3">
          {(data?.recent ?? []).map((item) => (
            <article key={item.id} className="data-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">{item.description}</p>
                  <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                    {item.category} • {formatDateDisplay(item.date)}
                  </p>
                  <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                    {item.card ?? item.account ?? "Sem origem"}
                    {item.destinationAccount ? ` → ${item.destinationAccount}` : ""}
                  </p>
                </div>
                <p
                  className={`w-full break-words text-left font-semibold sm:w-auto sm:text-right ${
                    item.type === "expense"
                      ? "amount-negative"
                      : item.type === "income"
                        ? "amount-positive"
                        : "text-[var(--color-foreground)]"
                  }`}
                >
                  {formatCurrency(item.amount)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="surface content-section">
        <h2 className="text-xl font-semibold">Vencimentos e estimativas do período</h2>
        <div className="mt-6 space-y-3">
          {(data?.upcoming ?? []).length ? (
            data?.upcoming.map((item) => (
              <article key={`${item.source}-${item.reference}`} className="data-card p-4">
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
                  <p className={item.type === "income" ? "w-full break-words text-left font-semibold text-[var(--color-primary)] sm:w-auto sm:text-right" : "w-full break-words text-left font-semibold amount-negative sm:w-auto sm:text-right"}>
                    {formatCurrency(item.amount)}
                  </p>
                </div>
              </article>
            ))
          ) : (
            <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
              {`Nenhum vencimento relevante foi encontrado em ${monthLabel}.`}
            </div>
          )}
        </div>
      </section>

      <section className="surface content-section">
        <h2 className="text-xl font-semibold">Mapa de categorias</h2>
        <div className="mt-6 space-y-3">
          {(data?.spendingInsights.categoryBreakdown ?? []).length ? (
            data?.spendingInsights.categoryBreakdown.map((item) => (
              <article key={item.name} className="data-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{item.name}</p>
                    <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                      {item.items} lançamentos • {Math.round(item.share * 100)}% do total de despesas
                    </p>
                  </div>
                  <p className="w-full break-words text-left font-semibold amount-negative sm:w-auto sm:text-right">
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
