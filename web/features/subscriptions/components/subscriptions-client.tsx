"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { subscriptionFormSchema, type SubscriptionFormValues } from "@/features/subscriptions/schemas/subscription-schema";
import { formatDateKey } from "@/lib/date";
import {
  findSubscriptionServicePreset,
  subscriptionServicePresets,
  type SubscriptionServicePreset
} from "@/lib/finance/presets";
import { formatMonthKeyLabel, normalizeMonthKey } from "@/lib/month";
import { formatCurrency } from "@/lib/utils";

type RefItem = { id: string; name: string };
type SubscriptionItem = {
  id: string;
  name: string;
  amount: number;
  billingDay: number;
  nextBillingDate: string;
  type: "income" | "expense";
  isActive: boolean;
  autoTithe: boolean;
  category: RefItem | null;
  account: RefItem | null;
  card: RefItem | null;
};

async function getSubscriptions() {
  const response = await fetch("/api/subscriptions", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar assinaturas");
  return (await response.json()) as { items: SubscriptionItem[] };
}

async function getCategories() {
  const response = await fetch("/api/categories", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar categorias");
  return (await response.json()) as { items: Array<{ id: string; name: string; type: "income" | "expense" }> };
}

async function getAccounts() {
  const response = await fetch("/api/accounts", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar contas");
  return (await response.json()) as { items: RefItem[] };
}

async function getCards() {
  const response = await fetch("/api/cards", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar cartões");
  return (await response.json()) as { items: RefItem[] };
}

function SubscriptionServiceCard({
  preset,
  active,
  onSelect
}: {
  preset: SubscriptionServicePreset;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className="service-preset-card"
      onClick={onSelect}
      style={{
        background: `linear-gradient(180deg, ${preset.background} 0%, color-mix(in srgb, ${preset.background} 82%, transparent) 100%)`,
        borderColor: active ? "color-mix(in srgb, var(--color-foreground) 32%, var(--color-border))" : undefined
      }}
      type="button"
    >
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className="service-badge"
            style={{
              background: `linear-gradient(135deg, ${preset.color} 0%, ${preset.accent} 100%)`
            }}
          >
            {preset.monogram}
          </span>
          <p className="mt-3 text-sm font-semibold text-[var(--color-foreground)]">{preset.label}</p>
          <p className="mt-1 text-xs leading-6 text-[var(--color-muted-foreground)]">{preset.description}</p>
        </div>
        <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-muted-foreground)]">
          Modelo
        </span>
      </div>
    </button>
  );
}

export function SubscriptionsClient() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const month = normalizeMonthKey(searchParams.get("month"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const formSectionRef = useRef<HTMLElement | null>(null);
  const subscriptionsQuery = useQuery({
    queryKey: ["subscriptions"],
    queryFn: getSubscriptions
  });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const cardsQuery = useQuery({ queryKey: ["cards"], queryFn: getCards });
  const subscriptions = subscriptionsQuery.data?.items ?? [];
  const activeSubscriptions = subscriptions.filter((item) => item.isActive);
  const monthlyExpenses = activeSubscriptions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
  const monthlyIncome = activeSubscriptions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);

  const form = useForm<SubscriptionFormValues>({
    resolver: zodResolver(subscriptionFormSchema),
    defaultValues: {
      name: "",
      amount: 0,
      billingDay: 1,
      categoryId: "",
      accountId: "",
      cardId: "",
      nextBillingDate: formatDateKey(new Date()),
      type: "expense",
      isActive: true,
      autoTithe: false
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (values: SubscriptionFormValues) => {
      const response = await fetch(editingId ? `/api/subscriptions/${editingId}` : "/api/subscriptions", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      if (!response.ok) throw new Error(editingId ? "Falha ao atualizar assinatura" : "Falha ao criar assinatura");
      return response.json();
    },
    onSuccess: async () => {
      toast.success(editingId ? "Assinatura atualizada" : "Assinatura criada");
      setEditingId(null);
      form.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    }
  });

  const generateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/subscriptions/${id}/generate-transaction`, {
        method: "POST"
      });
      if (!response.ok) throw new Error("Falha ao gerar transação");
      return response.json();
    },
    onSuccess: async () => {
      toast.success("Transação gerada");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["cards"] })
      ]);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Falha ao excluir assinatura");
    },
    onSuccess: async () => {
      toast.success("Assinatura excluída");
      if (editingId) {
        setEditingId(null);
        form.reset();
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    }
  });

  const startEditing = (item: SubscriptionItem) => {
    setEditingId(item.id);
    form.reset({
      name: item.name,
      amount: item.amount,
      billingDay: item.billingDay,
      categoryId: item.category?.id ?? "",
      accountId: item.account?.id ?? "",
      cardId: item.card?.id ?? "",
      nextBillingDate: formatDateKey(new Date(item.nextBillingDate)),
      type: item.type,
      isActive: item.isActive,
      autoTithe: item.autoTithe
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    form.reset({
      name: "",
      amount: 0,
      billingDay: 1,
      categoryId: "",
      accountId: "",
      cardId: "",
      nextBillingDate: formatDateKey(new Date()),
      type: "expense",
      isActive: true,
      autoTithe: false
    });
  };

  const selectedType = form.watch("type");
  const selectedAccountId = form.watch("accountId");
  const selectedCardId = form.watch("cardId");
  const filteredCategories = (categoriesQuery.data?.items ?? []).filter((item) => item.type === selectedType);
  const isEditing = editingId !== null;
  const selectedName = form.watch("name");
  const streamingCategoryId =
    (categoriesQuery.data?.items ?? []).find(
      (item) => item.type === "expense" && item.name === "Streaming e assinaturas"
    )?.id ?? "";

  useEffect(() => {
    if (selectedType === "income" && selectedCardId) {
      form.setValue("cardId", "");
      return;
    }

    if (selectedCardId && selectedAccountId) {
      form.setValue("accountId", "");
    }
  }, [form, selectedAccountId, selectedCardId, selectedType]);

  useEffect(() => {
    if (!editingId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("sub-name")?.focus();
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [editingId]);

  const applyServicePreset = (preset: SubscriptionServicePreset) => {
    const currentValues = form.getValues();
    form.reset({
      ...currentValues,
      name: preset.label,
      type: preset.type,
      categoryId: preset.type === "expense" ? streamingCategoryId || currentValues.categoryId || "" : currentValues.categoryId,
      autoTithe: false
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="surface content-section" ref={formSectionRef}>
        <div className="eyebrow">Assinaturas</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
          {isEditing ? "Editar recorrência" : "Nova recorrência"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Use recorrências para registrar despesas e receitas que se repetem todo mês e manter o dashboard coerente com
          a rotina financeira.
        </p>
        <p className="mt-3 text-sm font-medium text-[var(--color-primary)]">
          Competência ativa: {formatMonthKeyLabel(month)}
        </p>
        <div className="mt-6 space-y-3">
          <Label>Serviços populares</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {subscriptionServicePresets.map((preset) => (
              <SubscriptionServiceCard
                active={selectedName === preset.label}
                key={preset.value}
                onSelect={() => applyServicePreset(preset)}
                preset={preset}
              />
            ))}
          </div>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Toque em um modelo para preencher rapidamente o nome e sugerir a categoria certa de streaming.
          </p>
        </div>
        <form className="mt-8 space-y-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <div className="space-y-2">
            <Label htmlFor="sub-name">Nome</Label>
            <Input id="sub-name" {...form.register("name")} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="sub-amount">Valor</Label>
              <CurrencyInput control={form.control} id="sub-amount" name="amount" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-day">Dia</Label>
              <Input id="sub-day" type="number" {...form.register("billingDay")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-next">{selectedType === "income" ? "Próximo recebimento" : "Próxima cobrança"}</Label>
              <Input id="sub-next" type="date" {...form.register("nextBillingDate")} />
              {form.formState.errors.nextBillingDate ? (
                <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.nextBillingDate.message}</p>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sub-type">Tipo</Label>
              <Select id="sub-type" {...form.register("type")}>
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-category">Categoria</Label>
              <Select id="sub-category" {...form.register("categoryId")}>
                <option value="">Sem categoria</option>
                {filteredCategories.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sub-account">Conta</Label>
              <Select id="sub-account" {...form.register("accountId")}>
                <option value="">Sem conta</option>
                {(accountsQuery.data?.items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </Select>
              {form.formState.errors.accountId ? (
                <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.accountId.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-card">Cartão</Label>
              <Select id="sub-card" {...form.register("cardId")}>
                <option value="">Sem cartão</option>
                {(cardsQuery.data?.items ?? []).map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </Select>
              {form.formState.errors.cardId ? (
                <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.cardId.message}</p>
              ) : null}
            </div>
          </div>
          {selectedType === "income" ? (
            <label className="muted-panel flex items-center gap-3 text-sm">
              <input className="app-checkbox" type="checkbox" {...form.register("autoTithe")} />
              Considerar dízimo nesta receita recorrente
            </label>
          ) : null}
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Vincule a recorrência à conta ou ao cartão correto para que relatórios, fatura e painel reflitam o impacto
            financeiro no lugar certo.
          </p>
          <Button className="w-full" disabled={saveMutation.isPending} type="submit">
            {saveMutation.isPending ? "Salvando..." : isEditing ? "Salvar assinatura" : "Criar assinatura"}
          </Button>
          {isEditing ? (
            <Button className="w-full" onClick={cancelEditing} type="button" variant="ghost">
              Cancelar edição
            </Button>
          ) : null}
        </form>
      </section>

      <section className="surface content-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Assinaturas ativas</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Controle o custo fixo mensal e o próximo lançamento previsto de cada recorrência no mês selecionado.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="metric-card">
              <p className="metric-label">Saídas mensais</p>
              <p className="metric-value amount-negative">{formatCurrency(monthlyExpenses)}</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Entradas mensais</p>
              <p className="metric-value">{formatCurrency(monthlyIncome)}</p>
            </article>
          </div>
        </div>
        <div className="mt-6 space-y-3">
          {subscriptions.map((item) => {
            const servicePreset = findSubscriptionServicePreset(item.name);

            return (
              <article key={item.id} className="data-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    {servicePreset ? (
                      <div className="mb-3 flex items-center gap-3">
                        <span
                          className="service-badge h-11 min-w-11 rounded-[1rem] px-3 text-xs"
                          style={{
                            background: `linear-gradient(135deg, ${servicePreset.color} 0%, ${servicePreset.accent} 100%)`
                          }}
                        >
                          {servicePreset.monogram}
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--color-foreground)]">{item.name}</p>
                          <p className="text-xs text-[var(--color-muted-foreground)]">{servicePreset.description}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="font-semibold">{item.name}</p>
                    )}
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      {item.category?.name ?? "Sem categoria"} • {item.type === "income" ? "próximo recebimento em " : "próxima cobrança em "}
                      {new Date(item.nextBillingDate).toLocaleDateString("pt-BR")}
                    </p>
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                    {item.card?.name ?? item.account?.name ?? "Sem origem financeira"} •{" "}
                    {item.type === "expense" ? "Despesa recorrente" : "Receita recorrente"}
                  </p>
                  {item.autoTithe ? (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Dízimo automático incluído nesta recorrência
                    </p>
                  ) : null}
                </div>
                  <p className={item.type === "expense" ? "font-semibold amount-negative" : "font-semibold"}>{formatCurrency(item.amount)}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Button onClick={() => startEditing(item)} type="button" variant="secondary">
                    Editar
                  </Button>
                  <Button
                    disabled={generateMutation.isPending}
                    onClick={() => generateMutation.mutate(item.id)}
                    type="button"
                    variant="secondary"
                  >
                    Gerar transação
                  </Button>
                  <Button
                    disabled={deleteMutation.isPending}
                    onClick={() => deleteMutation.mutate(item.id)}
                    type="button"
                    variant="ghost"
                  >
                    Excluir
                  </Button>
                </div>
              </article>
            );
          })}
          {!subscriptionsQuery.isLoading && subscriptions.length === 0 ? (
            <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
              Nenhuma recorrência foi cadastrada ainda. Use assinaturas para automatizar cobranças fixas e manter o
              resultado mensal mais previsível.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
