"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PresetChip } from "@/components/ui/preset-chip";
import { Select } from "@/components/ui/select";
import { cardFormSchema, type CardFormValues } from "@/features/cards/schemas/card-schema";
import { brazilianInstitutions, cardBrandPresets, cardColorPresets, findPreset } from "@/lib/finance/presets";
import { formatMonthKeyLabel, normalizeMonthKey } from "@/lib/month";
import { ensureApiResponse } from "@/lib/observability/http";
import { formatCurrency } from "@/lib/utils";

type CardItem = {
  id: string;
  name: string;
  brand: string;
  last4?: string | null;
  limitAmount: number;
  availableLimit: number;
  statementAmount: number;
  statementOutstandingAmount: number;
  outstandingAmount: number;
  statementMonth: string;
  closeDate: string;
  dueDate: string;
  payableStatementAmount: number;
  payableStatementMonth: string;
  payableDueDate: string;
  dueDay: number;
  closeDay: number;
  statementMonthAnchor: "close_month" | "previous_month";
  color: string;
  institution?: string | null;
};

type AccountItem = {
  id: string;
  name: string;
};

type StatementPayload = {
    card: {
      id: string;
      name: string;
      brand: string;
      last4?: string | null;
      limitAmount: number;
      closeDay: number;
      dueDay: number;
      statementMonthAnchor: "close_month" | "previous_month";
    };
  month: string;
  summary: {
    totalAmount: number;
    statementOutstandingAmount: number;
    outstandingAmount: number;
    availableLimit: number;
    installmentItems: number;
    transactions: number;
    cycleStart: string;
    cycleEnd: string;
    closeDate: string;
    dueDate: string;
  };
  itemsMeta: {
    returned: number;
    limit: number;
    hasMore: boolean;
  };
  payment: {
    id: string;
    amount: number;
    paidAt: string;
    transactionId?: string | null;
    account: {
      id: string;
      name: string;
    };
  } | null;
  items: Array<{
    id: string;
    date: string;
    description: string;
    amount: number;
    type: string;
    category: string;
    installmentLabel: string | null;
  }>;
};

const invalidFieldClassName =
  "border-[var(--color-destructive)] focus:border-[var(--color-destructive)] focus:ring-[var(--color-destructive)]/12";

async function getCards(month: string) {
  const response = await fetch(`/api/cards?month=${month}`, { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar cartoes", method: "GET", path: "/api/cards" });
  if (!response.ok) throw new Error("Falha ao carregar cartões");
  return (await response.json()) as { items: CardItem[] };
}

async function getAccounts() {
  const response = await fetch("/api/accounts", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar contas", method: "GET", path: "/api/accounts" });
  if (!response.ok) throw new Error("Falha ao carregar contas");
  return (await response.json()) as { items: AccountItem[] };
}

async function createCard(values: CardFormValues) {
  const response = await fetch("/api/cards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao criar cartao", method: "POST", path: "/api/cards" });

  if (!response.ok) throw new Error("Falha ao criar cartão");
  return response.json();
}

async function updateCard(id: string, values: CardFormValues) {
  const response = await fetch(`/api/cards/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao atualizar cartao", method: "PATCH", path: `/api/cards/${id}` });

  if (!response.ok) throw new Error("Falha ao atualizar cartão");
  return response.json();
}

async function deleteCard(id: string) {
  const response = await fetch(`/api/cards/${id}`, {
    method: "DELETE"
  });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao excluir cartao", method: "DELETE", path: `/api/cards/${id}` });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? "Falha ao excluir cartão");
  }
}

async function payStatement(cardId: string, month: string, accountId: string) {
  const response = await fetch(`/api/cards/${cardId}/statement/pay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      month,
      accountId
    })
  });
  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao pagar fatura",
    method: "POST",
    path: `/api/cards/${cardId}/statement/pay`
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? "Falha ao pagar fatura");
  }

  return response.json();
}

export function CardsClient() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const month = normalizeMonthKey(searchParams.get("month"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const formSectionRef = useRef<HTMLElement | null>(null);
  const statementSectionRef = useRef<HTMLElement | null>(null);
  const [selectedStatementCardId, setSelectedStatementCardId] = useState<string>("");
  const [statementMonthState, setStatementMonthState] = useState({ sourceMonth: month, value: month });
  const statementMonth = statementMonthState.sourceMonth === month ? statementMonthState.value : month;
  const [statementPaymentAccountId, setStatementPaymentAccountId] = useState<string>("");
  const [statementItemsLimit, setStatementItemsLimit] = useState<string>("50");
  const cardsQuery = useQuery({
    queryKey: ["cards", month],
    queryFn: () => getCards(month),
    staleTime: 30_000,
    placeholderData: (previousData) => previousData
  });
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts, staleTime: 30_000 });
  const cards = useMemo(() => cardsQuery.data?.items ?? [], [cardsQuery.data?.items]);
  const accounts = useMemo(() => accountsQuery.data?.items ?? [], [accountsQuery.data?.items]);
  const { totalLimit, totalStatement, totalOutstanding } = useMemo(
    () => ({
      totalLimit: cards.reduce((sum, card) => sum + card.limitAmount, 0),
      totalStatement: cards.reduce((sum, card) => sum + card.statementAmount, 0),
      totalOutstanding: cards.reduce((sum, card) => sum + card.outstandingAmount, 0)
    }),
    [cards]
  );
  const statementQuery = useQuery({
    queryKey: ["card-statement", selectedStatementCardId, statementMonth, statementItemsLimit],
    queryFn: async () => {
      const response = await fetch(
        `/api/cards/${selectedStatementCardId}/statement?month=${statementMonth}&limit=${statementItemsLimit}`,
        {
          cache: "no-store"
        }
      );
      await ensureApiResponse(response, {
        fallbackMessage: "Falha ao carregar fatura",
        method: "GET",
        path: `/api/cards/${selectedStatementCardId}/statement`
      });
      if (!response.ok) throw new Error("Falha ao carregar fatura");
      return (await response.json()) as StatementPayload;
    },
    enabled: Boolean(selectedStatementCardId),
    staleTime: 15_000,
    placeholderData: (previousData) => previousData
  });
  const payStatementMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStatementCardId || !selectedStatementPaymentAccountId) {
        throw new Error("Selecione a conta de pagamento");
      }

      return payStatement(selectedStatementCardId, statementMonth, selectedStatementPaymentAccountId);
    },
    onSuccess: async () => {
      toast.success("Fatura paga com sucesso");
      setStatementPaymentAccountId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["card-statement", selectedStatementCardId, statementMonth] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["cards"] })
      ]);
    },
    onError: (error) => {
      toast.error("Não foi possível pagar a fatura", {
        description: error.message
      });
    }
  });
  const form = useForm<z.input<typeof cardFormSchema>, unknown, CardFormValues>({
    resolver: zodResolver(cardFormSchema),
    defaultValues: {
      name: "",
      brand: cardBrandPresets[0].value,
      last4: "",
      limitAmount: 0,
      dueDay: 10,
      closeDay: 3,
      statementMonthAnchor: "close_month",
      color: cardColorPresets[0].value,
      institution: brazilianInstitutions[0].value
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CardFormValues) => {
      if (editingId) {
        return updateCard(editingId, values);
      }

      return createCard(values);
    },
    onSuccess: async () => {
      const wasEditing = Boolean(editingId);
      toast.success(editingId ? "Cartão atualizado" : "Cartão criado");
      setEditingId(null);
      if (wasEditing) {
        setIsEditorOpen(false);
      }
      form.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cards"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: () => {
      toast.error(editingId ? "Não foi possível atualizar o cartão" : "Não foi possível criar o cartão");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCard,
    onSuccess: async () => {
      toast.success("Cartão excluído");
      if (editingId) {
        setEditingId(null);
        setIsEditorOpen(false);
        form.reset();
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cards"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: (error) => {
      toast.error("Não foi possível excluir o cartão", {
        description: error.message
      });
    }
  });

  const startEditing = (card: CardItem) => {
    setIsEditorOpen(true);
    setEditingId(card.id);
    form.reset({
      name: card.name,
      brand: card.brand,
      last4: card.last4 ?? "",
      limitAmount: card.limitAmount,
      dueDay: card.dueDay,
      closeDay: card.closeDay,
      statementMonthAnchor: card.statementMonthAnchor,
      color: card.color,
      institution: card.institution ?? ""
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setIsEditorOpen(false);
    form.reset();
  };

  const openCreateForm = () => {
    setEditingId(null);
    setIsEditorOpen(true);
    form.reset();
  };

  const isEditing = editingId !== null;
  const showEditor = isEditorOpen || isEditing || cards.length === 0;
  const selectedStatementCard = cards.find((card) => card.id === selectedStatementCardId) ?? null;
  const statementIsPaid = Boolean(statementQuery.data?.payment);
  const statementOutstandingAmount = statementQuery.data?.summary.statementOutstandingAmount ?? 0;
  const canPayStatement = Boolean(statementQuery.data && !statementIsPaid && statementOutstandingAmount > 0);
  const selectedBrand = useWatch({ control: form.control, name: "brand" }) ?? cardBrandPresets[0].value;
  const selectedInstitution = useWatch({ control: form.control, name: "institution" }) ?? "";
  const selectedColor = useWatch({ control: form.control, name: "color" }) ?? cardColorPresets[0].value;
  const scrollEditorIntoView = () => {
    const timeout = window.setTimeout(() => {
      const target = document.getElementById("card-name");
      const scrollTarget = target ?? formSectionRef.current;

      scrollTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    }, 80);

    return () => window.clearTimeout(timeout);
  };

  const getDefaultStatementMonth = (card: CardItem) =>
    card.payableStatementAmount > 0 ? card.payableStatementMonth : card.statementMonth;

  const scrollToStatementWorkspace = () => {
    window.setTimeout(() => {
      statementSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };

  const resetStatementWorkspace = () => {
    setSelectedStatementCardId("");
    setStatementPaymentAccountId("");
    setStatementMonthState({ sourceMonth: month, value: month });
    setStatementItemsLimit("50");
  };

  const applyStatementSelection = (card: CardItem, monthOverride?: string, options?: { scroll?: boolean }) => {
    setSelectedStatementCardId(card.id);
    setStatementPaymentAccountId("");
    setStatementMonthState({ sourceMonth: month, value: monthOverride ?? getDefaultStatementMonth(card) });
    setStatementItemsLimit("50");
    if (options?.scroll) {
      scrollToStatementWorkspace();
    }
  };

  const openStatementWorkspace = (card: CardItem, monthOverride?: string) => {
    applyStatementSelection(card, monthOverride, { scroll: true });
  };

  const defaultStatementPaymentAccountId =
    statementQuery.data && !statementIsPaid && accounts.length === 1 ? accounts[0]!.id : "";
  const selectedStatementPaymentAccountId = statementPaymentAccountId || defaultStatementPaymentAccountId;

  useEffect(() => {
    if (!editingId) {
      return;
    }

    return scrollEditorIntoView();
  }, [editingId]);

  return (
    <div className="grid gap-6 2xl:grid-cols-[0.85fr_1.15fr]">
      <section className="surface content-section" ref={formSectionRef}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Cartões</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              {isEditing ? "Editar cartão" : "Novo cartão"}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
              Vale Alimentação é gerenciado na área dedicada, fora do fluxo de cartões.
            </p>
          </div>
          {!showEditor ? (
            <Button onClick={openCreateForm} type="button" variant="secondary">
              Novo cartão
            </Button>
          ) : null}
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Cadastre cartões usados no crédito para acompanhar limite, ciclo de compras, vencimento e impacto nos
          relatórios.
        </p>
        <p className="mt-3 text-sm font-medium text-[var(--color-primary)]">
          Mês de análise: {formatMonthKeyLabel(month)}
        </p>

        {showEditor ? (
          <form
            className="mt-8 space-y-5"
            onSubmit={form.handleSubmit(
              (values) => saveMutation.mutate(values),
              (errors) => {
                const firstError = Object.values(errors).find((error) => error?.message)?.message;
                toast.error(firstError ?? "Revise os campos obrigatórios antes de continuar");
              }
            )}
          >
          <div className="space-y-2">
            <Label htmlFor="card-name">Nome</Label>
            <Input
              className={form.formState.errors.name ? invalidFieldClassName : undefined}
              id="card-name"
              placeholder="Ex.: Nubank principal"
              {...form.register("name")}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="card-brand">Bandeira</Label>
              <Select className={form.formState.errors.brand ? invalidFieldClassName : undefined} id="card-brand" {...form.register("brand")}>
                {cardBrandPresets.map((brand) => (
                  <option key={brand.value} value={brand.value}>
                    {brand.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-last4">Final</Label>
              <Input
                className={form.formState.errors.last4 ? invalidFieldClassName : undefined}
                id="card-last4"
                inputMode="numeric"
                maxLength={4}
                placeholder="1234"
                {...form.register("last4")}
              />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="card-limit">Limite</Label>
              <CurrencyInput control={form.control} id="card-limit" name="limitAmount" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-due">Vencimento</Label>
              <Input
                className={form.formState.errors.dueDay ? invalidFieldClassName : undefined}
                id="card-due"
                max={31}
                min={1}
                type="number"
                {...form.register("dueDay")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-close">Fechamento</Label>
              <Input
                className={form.formState.errors.closeDay ? invalidFieldClassName : undefined}
                id="card-close"
                max={31}
                min={1}
                type="number"
                {...form.register("closeDay")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="card-anchor">Regra da competência</Label>
              <Select
                className={form.formState.errors.statementMonthAnchor ? invalidFieldClassName : undefined}
                id="card-anchor"
                {...form.register("statementMonthAnchor")}
              >
                <option value="close_month">Mês do fechamento</option>
                <option value="previous_month">Mês anterior ao fechamento</option>
              </Select>
            </div>
          </div>
          <p className="text-xs leading-6 text-[var(--color-muted-foreground)]">
            Use <strong>mês do fechamento</strong> quando a fatura de abril fecha em abril. Use{" "}
            <strong>mês anterior ao fechamento</strong> quando a fatura de abril fecha em maio.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="card-institution">Instituição</Label>
              <Select
                className={form.formState.errors.institution ? invalidFieldClassName : undefined}
                id="card-institution"
                {...form.register("institution")}
              >
                {brazilianInstitutions.map((institution) => (
                  <option key={institution.value} value={institution.value}>
                    {institution.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-3">
              <Label>Paleta do cartão</Label>
              <div className="flex flex-wrap gap-3">
                {cardColorPresets.map((preset) => (
                  <button
                    aria-label={`Selecionar cor ${preset.label}`}
                    key={preset.value}
                    className="rounded-full"
                    onClick={() => form.setValue("color", preset.value, { shouldDirty: true })}
                    type="button"
                  >
                    <PresetChip
                      active={selectedColor === preset.value}
                      background={preset.background}
                      color={preset.color}
                      label={preset.label}
                      shortLabel={preset.shortLabel}
                      swatchOnly
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="muted-panel flex flex-wrap items-center gap-3">
            <PresetChip
              active
              background={findPreset(cardColorPresets, selectedColor)?.background ?? "rgba(17,17,17,0.16)"}
              color={findPreset(cardColorPresets, selectedColor)?.color ?? selectedColor}
              label="Cor do cartão"
              shortLabel=""
              swatchOnly
            />
            <PresetChip
              active
              background={findPreset(cardBrandPresets, selectedBrand)?.background ?? "rgba(29,78,216,0.14)"}
              color={findPreset(cardBrandPresets, selectedBrand)?.color ?? "#1D4ED8"}
              label={selectedBrand}
              shortLabel={findPreset(cardBrandPresets, selectedBrand)?.shortLabel ?? "CD"}
            />
            <PresetChip
              active
              background={findPreset(brazilianInstitutions, selectedInstitution)?.background ?? "rgba(122,28,172,0.14)"}
              color={findPreset(brazilianInstitutions, selectedInstitution)?.color ?? "#7A1CAC"}
              description={findPreset(brazilianInstitutions, selectedInstitution)?.description}
              label={selectedInstitution || "Instituição"}
              shortLabel={findPreset(brazilianInstitutions, selectedInstitution)?.shortLabel ?? "BK"}
            />
          </div>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            O limite e os dias de fechamento e vencimento são usados para acompanhar a fatura mensal e o limite
            disponível em tempo real.
          </p>
          {form.formState.errors.name ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.name.message}</p>
          ) : null}
          {form.formState.errors.brand ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.brand.message}</p>
          ) : null}
          {form.formState.errors.last4 ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.last4.message}</p>
          ) : null}
          {form.formState.errors.limitAmount ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.limitAmount.message}</p>
          ) : null}
          {form.formState.errors.dueDay ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.dueDay.message}</p>
          ) : null}
          {form.formState.errors.closeDay ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.closeDay.message}</p>
          ) : null}
          <Button className="w-full" disabled={saveMutation.isPending} type="submit">
            {saveMutation.isPending ? "Salvando..." : isEditing ? "Salvar cartão" : "Criar cartão"}
          </Button>
          {isEditing ? (
            <Button className="w-full" onClick={cancelEditing} type="button" variant="ghost">
              Cancelar edição
            </Button>
          ) : null}
          </form>
        ) : (
          <div className="muted-panel mt-8 flex flex-col gap-4 px-4 py-5 text-sm text-[var(--color-muted-foreground)]">
            <p>O editor foi fechado após a última edição concluída.</p>
            <Button className="w-full sm:w-auto" onClick={openCreateForm} type="button" variant="secondary">
              Novo cartão
            </Button>
          </div>
        )}
      </section>

      <section className="surface content-section">
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Cartões ativos</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Acompanhe o limite total, a soma das faturas abertas e a utilização consolidada.
            </p>
          </div>
          <div className="metric-grid-compact">
            <article className="metric-card">
              <p className="metric-label">Limite total</p>
              <p className="metric-value amount-nowrap">{formatCurrency(totalLimit)}</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Fatura aberta</p>
              <p className="metric-value amount-nowrap">{formatCurrency(totalStatement)}</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Saldo em aberto</p>
              <p className="metric-value amount-nowrap">{formatCurrency(totalOutstanding)}</p>
            </article>
          </div>
        </div>
        <div className="content-grid mt-6">
          {cards.map((card) => (
            <article
              key={card.id}
              className="data-card p-4"
              style={{
                borderColor: `color-mix(in srgb, ${card.color} 32%, var(--color-border))`
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <PresetChip
                    compact
                    active
                    background={findPreset(cardColorPresets, card.color)?.background ?? "rgba(17,17,17,0.16)"}
                    color={findPreset(cardColorPresets, card.color)?.color ?? card.color}
                    label={card.name}
                    shortLabel=""
                    swatchOnly
                  />
                  <div className="min-w-0">
                    <p className="break-words text-base font-semibold text-[var(--color-foreground)]">{card.name}</p>
                    <p className="mt-1 text-xs tracking-[0.04em] text-[var(--color-muted-foreground)]">
                      {card.brand} {card.last4 ? `• ${card.last4}` : ""}
                    </p>
                  </div>
                </div>
                <div className="w-full min-w-0 rounded-[1rem] border border-[var(--color-border)]/60 bg-[var(--color-muted)]/20 px-3 py-3 sm:w-auto sm:text-right">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                    Limite
                  </p>
                  <p className="amount-nowrap mt-1 text-lg font-semibold text-[var(--color-foreground)]">
                    {formatCurrency(card.limitAmount)}
                  </p>
                </div>
              </div>
              <div className="metric-grid-compact mt-4">
                <div className="rounded-[1.15rem] border border-[var(--color-border)]/60 bg-[var(--color-muted)]/18 px-4 py-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                    Fatura do ciclo
                  </p>
                  <p className="amount-nowrap mt-2 text-lg font-semibold text-[var(--color-foreground)]">
                    {formatCurrency(card.statementAmount)}
                  </p>
                  <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                    Ciclo de {formatMonthKeyLabel(card.statementMonth)}
                  </p>
                </div>
                <div className="rounded-[1.15rem] border border-[var(--color-border)]/60 bg-[var(--color-muted)]/18 px-4 py-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                    Disponível
                  </p>
                  <p
                    className={`amount-nowrap mt-2 text-lg font-semibold ${card.availableLimit < 0 ? "amount-negative" : "text-[var(--color-foreground)]"}`}
                  >
                    {formatCurrency(card.availableLimit)}
                  </p>
                  <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                    Limite total de {formatCurrency(card.limitAmount)}.
                  </p>
                </div>
                <div className="rounded-[1.15rem] border border-[var(--color-border)]/60 bg-[var(--color-muted)]/18 px-4 py-4">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                    Saldo total do cartao
                  </p>
                  <p className="amount-nowrap mt-2 text-lg font-semibold text-[var(--color-foreground)]">
                    {formatCurrency(card.outstandingAmount)}
                  </p>
                  <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                    Valor consolidado que ainda consome limite.
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-[1.15rem] border border-[var(--color-border)]/60 bg-[var(--color-muted)]/18 px-4 py-4">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                  Ciclo do cartão
                </p>
                <div className="detail-grid mt-3">
                  <div className="rounded-[1rem] border border-[var(--color-border)]/70 bg-[var(--color-card)] px-3 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                      Fecha
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-foreground)]">Dia {card.closeDay}</p>
                  </div>
                  <div className="rounded-[1rem] border border-[var(--color-border)]/70 bg-[var(--color-card)] px-3 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                      Vence
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-foreground)]">Dia {card.dueDay}</p>
                  </div>
                  <div className="rounded-[1rem] border border-[var(--color-border)]/70 bg-[var(--color-card)] px-3 py-3">
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">
                      Proximo pagamento
                    </p>
                    {card.payableStatementAmount > 0 ? (
                      <>
                        <p className="mt-1 break-words text-sm font-semibold leading-5 text-[var(--color-foreground)]">
                          {new Date(card.payableDueDate).toLocaleDateString("pt-BR")}
                        </p>
                        <p className="mt-1 break-words text-xs text-[var(--color-muted-foreground)]">
                          {formatCurrency(card.payableStatementAmount)} • {formatMonthKeyLabel(card.payableStatementMonth)}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 break-words text-sm font-semibold leading-5 text-[var(--color-muted-foreground)]">
                        Sem cobrança pendente
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-muted-foreground)]">
                {card.institution ? <span>{card.institution}</span> : null}
                <span>Competência {formatMonthKeyLabel(card.statementMonth)}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(214,199,172,0.6)]">
                <div
                  className="h-full rounded-full bg-[var(--color-coral-500)]"
                  style={{
                    width: `${Math.min(100, card.limitAmount > 0 ? (card.outstandingAmount / card.limitAmount) * 100 : 0)}%`
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                Utilizacao: {card.limitAmount > 0 ? Math.round((card.outstandingAmount / card.limitAmount) * 100) : 0}%
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => openStatementWorkspace(card)} type="button" variant={card.payableStatementAmount > 0 ? "default" : "secondary"}>
                  {card.payableStatementAmount > 0 ? "Abrir e pagar fatura" : "Abrir fatura"}
                </Button>
                <Button onClick={() => startEditing(card)} type="button" variant="secondary">
                  Editar
                </Button>
                <Button
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(card.id)}
                  type="button"
                  variant="ghost"
                >
                  Excluir
                </Button>
              </div>
            </article>
          ))}
          {!cardsQuery.isLoading && cards.length === 0 ? (
            <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)] md:col-span-2">
              Nenhum cartão foi cadastrado ainda. Cadastre cartões de crédito para controlar limite e fatura com
              precisão.
            </div>
          ) : null}
        </div>
      </section>

      <section className="surface content-section 2xl:col-span-2" ref={statementSectionRef}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <div className="eyebrow">Central de fatura</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Acompanhe e pague a fatura certa</h2>
            <p className="mt-4 text-sm leading-7 text-[var(--color-muted-foreground)]">
              O pagamento da fatura fica concentrado aqui. Selecione o cartão, confira o ciclo e registre a
              baixa sem depender dos filtros da listagem.
            </p>
          </div>
          {selectedStatementCardId ? (
            <Button onClick={resetStatementWorkspace} type="button" variant="ghost">
              Limpar selecao
            </Button>
          ) : null}
        </div>

        <article className="surface-strong mt-6 rounded-[30px] p-5 md:p-6">
          <div className="flex h-full flex-col justify-between gap-5">
            <div>
              <p className="metric-label text-white/72">Acao principal</p>
              {!selectedStatementCardId ? (
                <>
                  <h3 className="mt-3 text-2xl font-semibold text-white">Selecione um cartão para abrir a fatura</h3>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-white/80">
                    Assim que um cartão for escolhido, o ciclo, o saldo pendente e a ação de pagamento aparecem
                    aqui no topo.
                  </p>
                </>
              ) : statementQuery.isLoading && !statementQuery.data ? (
                <>
                  <h3 className="mt-3 text-2xl font-semibold text-white">Carregando o ciclo selecionado</h3>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-white/80">
                    Buscando os lancamentos, o saldo pendente e os dados de pagamento da fatura.
                  </p>
                </>
              ) : statementQuery.data ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-2xl font-semibold text-white">
                        {selectedStatementCard?.name ?? statementQuery.data.card.name}
                      </h3>
                      <p className="mt-2 break-words text-sm text-white/72">
                        {formatMonthKeyLabel(statementQuery.data.month)} • vence em{" "}
                        {new Date(statementQuery.data.summary.dueDate).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="rounded-full border border-white/16 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-white/80">
                      {statementIsPaid
                        ? "Fatura baixada"
                        : canPayStatement
                          ? "Saldo pendente"
                          : statementQuery.data.summary.totalAmount > 0
                            ? "Ciclo conciliado"
                            : "Sem lancamentos"}
                    </div>
                  </div>

                  <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-white/62">
                    {statementIsPaid ? "Valor baixado" : canPayStatement ? "Valor a pagar agora" : "Resumo do ciclo"}
                  </p>
                  <p className="hero-amount amount-nowrap mt-3 text-white">
                    {formatCurrency(
                      statementIsPaid
                        ? statementQuery.data.payment!.amount
                        : canPayStatement
                          ? statementOutstandingAmount
                          : statementQuery.data.summary.totalAmount
                    )}
                  </p>
                  <p className="mt-3 max-w-xl text-sm leading-7 text-white/80">
                    {statementIsPaid
                      ? `Baixada em ${new Date(statementQuery.data.payment!.paidAt).toLocaleDateString("pt-BR")} pela conta ${statementQuery.data.payment!.account.name}.`
                      : canPayStatement
                        ? "Escolha a conta pagadora abaixo para registrar a baixa da fatura pendente."
                        : statementQuery.data.summary.totalAmount > 0
                          ? "Esse ciclo nao tem saldo pendente neste momento, mas continua disponivel para conferencia."
                          : "Ainda nao existem compras vinculadas a este ciclo."}
                  </p>
                </>
              ) : null}
            </div>

            <div className="rounded-[24px] border border-white/12 bg-white/8 p-4">
              {!selectedStatementCardId ? (
                <p className="text-sm leading-7 text-white/76">Escolha um cartão abaixo para destravar a central de fatura.</p>
              ) : statementQuery.isLoading && !statementQuery.data ? (
                <p className="text-sm leading-7 text-white/76">Preparando o painel de pagamento da fatura...</p>
              ) : statementQuery.data && canPayStatement ? (
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label className="text-white/78" htmlFor="statement-payment-account">
                      Conta pagadora
                    </Label>
                    <Select
                      id="statement-payment-account"
                      value={selectedStatementPaymentAccountId}
                      onChange={(event) => setStatementPaymentAccountId(event.target.value)}
                    >
                      <option value="">Selecione a conta pagadora</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </Select>
                    {accounts.length === 0 ? (
                      <p className="text-sm text-white/72">Cadastre uma conta para registrar o pagamento da fatura.</p>
                    ) : null}
                  </div>
                  <div className="flex items-end">
                    <Button
                      disabled={payStatementMutation.isPending || !selectedStatementPaymentAccountId}
                      onClick={() => payStatementMutation.mutate()}
                      type="button"
                    >
                      {payStatementMutation.isPending ? "Pagando..." : "Pagar fatura"}
                    </Button>
                  </div>
                </div>
              ) : statementQuery.data && statementIsPaid ? (
                <p className="text-sm leading-7 text-white/76">
                  O pagamento desta competencia ja foi registrado e nao precisa de nova acao.
                </p>
              ) : statementQuery.data ? (
                <p className="text-sm leading-7 text-white/76">
                  Nenhum saldo pendente foi encontrado para esta competencia.
                </p>
              ) : null}
            </div>
          </div>
        </article>

        <div className="mt-6 flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="statement-card">Cartão</Label>
            <Select
              id="statement-card"
              value={selectedStatementCardId}
              onChange={(event) => {
                const nextCardId = event.target.value;
                if (!nextCardId) {
                  resetStatementWorkspace();
                  return;
                }

                const nextCard = cards.find((item) => item.id === nextCardId);
                if (nextCard) {
                  applyStatementSelection(nextCard);
                }
              }}
            >
              <option value="">Selecione um cartão</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} {card.last4 ? `• ${card.last4}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="statement-month">Ciclo</Label>
            <DatePickerInput
              id="statement-month"
              onChange={(event) => setStatementMonthState({ sourceMonth: month, value: event.target.value })}
              type="month"
              value={statementMonth}
            />
          </div>
        </div>
        <div className="muted-panel mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-muted-foreground)]">
          <p>
            {selectedStatementCardId
              ? `Cartão selecionado: ${cards.find((item) => item.id === selectedStatementCardId)?.name ?? "Cartão"}.`
              : "Nenhum cartão selecionado."}
          </p>
          <p>{`Competência em análise: ${new Date(`${statementMonth}-01T12:00:00`).toLocaleDateString("pt-BR", {
            month: "long",
            year: "numeric"
          })}.`}</p>
        </div>
        <div className="mt-4 hidden">
          <Button
            onClick={() => {
              setSelectedStatementCardId("");
              setStatementPaymentAccountId("");
              setStatementMonthState({ sourceMonth: month, value: month });
              setStatementItemsLimit("50");
            }}
            type="button"
            variant="ghost"
          >
            Limpar seleção
          </Button>
        </div>

        {false ? (
          <div className="muted-panel mt-6 border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
            Selecione um cartão para acompanhar a competência, conferir a fatura e registrar o pagamento.
          </div>
        ) : null}

        {selectedStatementCardId && statementQuery.isLoading && !statementQuery.data ? (
          <div className="mt-6 grid gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`statement-loading-${index}`}
                className="muted-panel border border-dashed px-4 py-5 text-sm text-[var(--color-muted-foreground)]"
              >
                Carregando dados da fatura selecionada...
              </div>
            ))}
          </div>
        ) : null}

        {statementQuery.data ? (
          <div className="mt-6 space-y-6">
            {statementQuery.isFetching ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                Atualizando valores e lançamentos da fatura...
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {statementQuery.data.summary.transactions} lançamento
                {statementQuery.data.summary.transactions === 1 ? "" : "s"} nesta competência.
              </p>
              <div className="flex items-center gap-3">
                <Label htmlFor="statement-items-limit">Exibir</Label>
                <Select
                  id="statement-items-limit"
                  value={statementItemsLimit}
                  onChange={(event) => setStatementItemsLimit(event.target.value)}
                >
                  <option value="25">25 itens</option>
                  <option value="50">50 itens</option>
                  <option value="100">100 itens</option>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <article className="metric-card">
                <p className="metric-label">Total da competencia</p>
                <p className="metric-value amount-nowrap">{formatCurrency(statementQuery.data.summary.totalAmount)}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Saldo pendente</p>
                <p className="metric-value amount-nowrap">{formatCurrency(statementOutstandingAmount)}</p>
              </article>
              <article className="metric-card">
                <p className="metric-label">Saldo total do cartao</p>
                <p className="metric-value amount-nowrap">{formatCurrency(statementQuery.data.summary.outstandingAmount)}</p>
              </article>
              <article className="metric-card">
                <p className="text-sm text-[var(--color-muted-foreground)]">Limite disponível</p>
                <p className={`metric-value amount-nowrap ${statementQuery.data.summary.availableLimit < 0 ? "amount-negative" : ""}`}>{formatCurrency(statementQuery.data.summary.availableLimit)}</p>
              </article>
              <article className="metric-card">
                <p className="text-sm text-[var(--color-muted-foreground)]">Lançamentos</p>
                <p className="metric-value">{statementQuery.data.summary.transactions}</p>
              </article>
              <article className="metric-card">
                <p className="text-sm text-[var(--color-muted-foreground)]">Parceladas</p>
                <p className="metric-value">{statementQuery.data.summary.installmentItems}</p>
              </article>
            </div>

            <div className="muted-panel text-sm text-[var(--color-muted-foreground)]">
              <p>
                Ciclo da fatura: {new Date(statementQuery.data.summary.cycleStart).toLocaleDateString("pt-BR")} até{" "}
                {new Date(statementQuery.data.summary.cycleEnd).toLocaleDateString("pt-BR")}.
              </p>
              <p className="mt-2">
                Fechamento em {new Date(statementQuery.data.summary.closeDate).toLocaleDateString("pt-BR")} e
                vencimento em {new Date(statementQuery.data.summary.dueDate).toLocaleDateString("pt-BR")}.
              </p>
            </div>

            {/* Legacy payment panel migrated to the primary action panel above
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--color-muted-foreground)]">Pagamento da fatura</p>
                  {statementIsPaid ? (
                    <>
                      <p className="mt-2 text-lg font-semibold">
                        Pago em {new Date(statementQuery.data.payment!.paidAt).toLocaleDateString("pt-BR")}
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                        Conta de origem: {statementQuery.data.payment!.account.name}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-lg font-semibold">Fatura em aberto</p>
                      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                        Escolha uma conta para registrar a baixa da competência.
                      </p>
                    </>
                  )}
                </div>

                {!statementIsPaid && statementQuery.data.summary.totalAmount > 0 ? (
                  <div className="grid w-full gap-3 lg:max-w-[420px] lg:grid-cols-[1fr_auto]">
                    <Select
                      value={selectedStatementPaymentAccountId}
                      onChange={(event) => setStatementPaymentAccountId(event.target.value)}
                    >
                      <option value="">Selecione a conta pagadora</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      disabled={payStatementMutation.isPending || !selectedStatementPaymentAccountId}
                      onClick={() => payStatementMutation.mutate()}
                      type="button"
                    >
                      {payStatementMutation.isPending ? "Pagando..." : "Pagar fatura"}
                    </Button>
                  </div>
                ) : null}
              </div>
            */}

            <div className="space-y-3">
              {statementQuery.data.itemsMeta.hasMore ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Mostrando {statementQuery.data.itemsMeta.returned} de {statementQuery.data.summary.transactions} itens da competência.
                </p>
              ) : null}
              {statementQuery.data.items.map((item) => (
                <article key={item.id} className="data-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-semibold">{item.description}</p>
                      <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                        {item.category} • {new Date(item.date).toLocaleDateString("pt-BR")}
                        {item.installmentLabel ? ` • ${item.installmentLabel}` : ""}
                      </p>
                    </div>
                    <p className="amount-nowrap w-full text-left font-semibold sm:w-auto sm:text-right">
                      {formatCurrency(item.amount)}
                    </p>
                  </div>
                </article>
              ))}
              {statementQuery.data.items.length === 0 ? (
                <p className="text-sm text-[var(--color-muted-foreground)]">Nenhum lançamento nesta competência.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
