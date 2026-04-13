"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  installmentGroupUpdateSchema,
  type InstallmentGroupUpdateValues
} from "@/features/installments/schemas/installment-schema";
import { formatDateDisplay } from "@/lib/date";
import { formatMonthKeyLabel, getMonthRange, normalizeMonthKey } from "@/lib/month";
import { ensureApiResponse } from "@/lib/observability/http";
import { formatCurrency } from "@/lib/utils";

type InstallmentGroup = {
  id: string;
  description: string;
  totalAmount: number;
  installmentAmount?: number;
  installmentsTotal: number;
  installmentsPaid: number;
  installmentsRemaining: number;
  overdueOpenInstallments: number;
  nextInstallmentDate?: string | null;
  notes?: string | null;
  card?: { id: string; name: string } | null;
  category?: { id: string; name: string } | null;
};

type CardItem = {
  id: string;
  name: string;
};

type CategoryItem = {
  id: string;
  name: string;
  type: "income" | "expense";
};

async function getInstallments(filters: { from: string; to: string; cardId: string }) {
  const searchParams = new URLSearchParams();
  if (filters.from) searchParams.set("from", filters.from);
  if (filters.to) searchParams.set("to", filters.to);
  if (filters.cardId) searchParams.set("cardId", filters.cardId);

  const response = await fetch(`/api/installments?${searchParams.toString()}`, { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar parcelamentos", method: "GET", path: "/api/installments" });
  if (!response.ok) throw new Error("Falha ao carregar parcelamentos");
  return (await response.json()) as { items: InstallmentGroup[] };
}

async function getCards() {
  const response = await fetch("/api/cards", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar cartoes", method: "GET", path: "/api/cards" });
  if (!response.ok) throw new Error("Falha ao carregar cartões");
  return (await response.json()) as { items: CardItem[] };
}

async function getCategories() {
  const response = await fetch("/api/categories", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar categorias", method: "GET", path: "/api/categories" });
  if (!response.ok) throw new Error("Falha ao carregar categorias");
  return (await response.json()) as { items: CategoryItem[] };
}

export function InstallmentsClient() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const month = normalizeMonthKey(searchParams.get("month"));
  const monthRange = getMonthRange(month);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const editSectionRef = useRef<HTMLElement | null>(null);
  const [filters, setFilters] = useState({
    from: monthRange.from,
    to: monthRange.to,
    cardId: ""
  });
  const installmentsQuery = useQuery({
    queryKey: ["installments", filters],
    queryFn: () => getInstallments(filters)
  });
  const cardsQuery = useQuery({ queryKey: ["cards"], queryFn: getCards });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const groups = installmentsQuery.data?.items ?? [];
  const selectedFilterCard = (cardsQuery.data?.items ?? []).find((card) => card.id === filters.cardId);
  const totalAmount = groups.reduce((sum, item) => sum + item.totalAmount, 0);
  const overdueItems = groups.reduce((sum, item) => sum + item.overdueOpenInstallments, 0);
  const remainingInstallments = groups.reduce((sum, item) => sum + item.installmentsRemaining, 0);
  const form = useForm<InstallmentGroupUpdateValues>({
    resolver: zodResolver(installmentGroupUpdateSchema),
    defaultValues: {
      description: "",
      amount: undefined,
      categoryId: "",
      notes: ""
    }
  });

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      from: monthRange.from,
      to: monthRange.to
    }));
  }, [monthRange.from, monthRange.to]);

  useEffect(() => {
    if (!editingGroupId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      editSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("installment-description")?.focus();
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [editingGroupId]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/installments/${id}`, {
        method: "DELETE"
      });
      await ensureApiResponse(response, { fallbackMessage: "Falha ao excluir parcelamento", method: "DELETE", path: `/api/installments/${id}` });

      if (!response.ok) {
        throw new Error("Falha ao excluir parcelamento");
      }
    },
    onSuccess: async () => {
      toast.success("Grupo de parcelamento excluído");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["installments"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["cards"] })
      ]);
    },
    onError: () => {
      toast.error("Não foi possível excluir o parcelamento");
    }
  });
  const updateMutation = useMutation({
    mutationFn: async (values: InstallmentGroupUpdateValues) => {
      if (!editingGroupId) {
        throw new Error("Grupo não selecionado");
      }

      const response = await fetch(`/api/installments/${editingGroupId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(values)
      });
      await ensureApiResponse(response, { fallbackMessage: "Falha ao atualizar parcelamento", method: "PATCH", path: `/api/installments/${editingGroupId}` });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Falha ao atualizar parcelamento");
      }
    },
    onSuccess: async () => {
      toast.success("Grupo de parcelamento atualizado");
      setEditingGroupId(null);
      form.reset({
        description: "",
        amount: undefined,
        categoryId: "",
        notes: ""
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["installments"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["cards"] })
      ]);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar o parcelamento");
    }
  });
  const reconcileMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/installments/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "reconcile_due"
        })
      });
      await ensureApiResponse(response, { fallbackMessage: "Falha ao conciliar parcelamento", method: "PATCH", path: `/api/installments/${id}` });

      if (!response.ok) throw new Error("Falha ao conciliar parcelamento");
      return (await response.json()) as { reconciled: number };
    },
    onSuccess: async (payload) => {
      toast.success("Parcelas conciliadas", {
        description: `${payload.reconciled} parcela(s) marcadas como conciliadas.`
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["installments"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["cards"] })
      ]);
    },
    onError: () => {
      toast.error("Não foi possível conciliar o parcelamento");
    }
  });

  const startEditing = (item: InstallmentGroup) => {
    setEditingGroupId(item.id);
    form.reset({
      description: item.description,
      amount: item.installmentAmount,
      categoryId: item.category?.id ?? "",
      notes: item.notes ?? ""
    });
  };

  const cancelEditing = () => {
    setEditingGroupId(null);
    form.reset({
      description: "",
      amount: undefined,
      categoryId: "",
      notes: ""
    });
  };

  return (
    <div className="space-y-6">
      <section className="surface content-section">
        <div className="eyebrow">Parcelamentos</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Cartões e parcelas</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Esta visão agrega automaticamente compras parceladas registradas em transações com mais de uma parcela.
        </p>
        <p className="mt-3 text-sm font-medium text-[var(--color-primary)]">
          Competência ativa: {formatMonthKeyLabel(month)}
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="installments-filter-from">De</Label>
            <DatePickerInput
              disabled
              id="installments-filter-from"
              readOnly
              type="date"
              value={filters.from}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="installments-filter-to">Até</Label>
            <DatePickerInput
              disabled
              id="installments-filter-to"
              readOnly
              type="date"
              value={filters.to}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="installments-filter-card">Cartão</Label>
            <Select
              id="installments-filter-card"
              value={filters.cardId}
              onChange={(event) => setFilters((current) => ({ ...current, cardId: event.target.value }))}
            >
              <option value="">Todos os cartões</option>
              {(cardsQuery.data?.items ?? []).map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="muted-panel mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-muted-foreground)]">
          <p>{`Mês ativo: ${formatMonthKeyLabel(month)}.`}</p>
          <p>{selectedFilterCard ? `Refinando por cartão: ${selectedFilterCard.name}.` : "Mostrando todos os cartões."}</p>
        </div>
        <div className="mt-4">
          <Button onClick={() => setFilters({ from: monthRange.from, to: monthRange.to, cardId: "" })} type="button" variant="ghost">
            Limpar refinamentos
          </Button>
        </div>
      </section>

      {editingGroupId ? (
        <section className="surface content-section" ref={editSectionRef}>
          <p className="eyebrow">
            Edição do grupo
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Atualizar parcelamento</h2>
          <form className="mt-6 space-y-4" onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}>
            <div className="space-y-2">
              <Label htmlFor="installment-description">Descrição base</Label>
              <Input id="installment-description" {...form.register("description")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="installment-amount">Valor da parcela</Label>
              <CurrencyInput control={form.control} id="installment-amount" name="amount" nullable />
            </div>
            <div className="space-y-2">
              <Label htmlFor="installment-category">Categoria</Label>
              <Select id="installment-category" {...form.register("categoryId")}>
                <option value="">Sem categoria</option>
                {(categoriesQuery.data?.items ?? [])
                  .filter((category) => category.type === "expense")
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="installment-notes">Observações</Label>
              <Input id="installment-notes" {...form.register("notes")} />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button disabled={updateMutation.isPending} type="submit">
                {updateMutation.isPending ? "Salvando..." : "Salvar grupo"}
              </Button>
              <Button onClick={cancelEditing} type="button" variant="ghost">
                Cancelar
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <article className="metric-card">
          <p className="metric-label">Valor parcelado</p>
          <p className="metric-value amount-nowrap">{formatCurrency(totalAmount)}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Parcelas restantes</p>
          <p className="metric-value">{remainingInstallments}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Vencidas em aberto</p>
          <p className="metric-value">{overdueItems}</p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((item) => (
          <article key={item.id} className="surface content-section">
            <p className="break-words text-lg font-semibold">{item.description}</p>
            <p className="mt-2 break-words text-sm text-[var(--color-muted-foreground)]">
              {item.category?.name ?? "Sem categoria"} • {item.card?.name ?? "Sem cartão"}
            </p>
            <p className="amount-nowrap mt-4 text-2xl font-semibold">{formatCurrency(item.totalAmount)}</p>
            <p className="mt-2 break-words text-sm text-[var(--color-muted-foreground)]">
              Parcela base: {formatCurrency(item.installmentAmount ?? 0)}
            </p>
            <p className="mt-2 break-words text-sm text-[var(--color-muted-foreground)]">
              {item.installmentsPaid}/{item.installmentsTotal} conciliadas
            </p>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--color-secondary)]">
              <div
                className="h-full rounded-full bg-[var(--color-primary)]"
                style={{ width: `${(item.installmentsPaid / item.installmentsTotal) * 100}%` }}
              />
            </div>
            <p className="mt-4 break-words text-sm text-[var(--color-muted-foreground)]">
              Próxima: {item.nextInstallmentDate ? formatDateDisplay(item.nextInstallmentDate) : "Finalizado"}
            </p>
            <p className="mt-2 break-words text-sm text-[var(--color-muted-foreground)]">
              Em atraso e abertas: {item.overdueOpenInstallments}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => startEditing(item)} type="button" variant="secondary">
                Editar grupo
              </Button>
              <Button
                disabled={reconcileMutation.isPending || item.overdueOpenInstallments === 0}
                onClick={() => reconcileMutation.mutate(item.id)}
                type="button"
              >
                Conciliar vencidas
              </Button>
              <Button
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(item.id)}
                type="button"
                variant="ghost"
              >
                Excluir grupo
              </Button>
            </div>
          </article>
        ))}
        {!installmentsQuery.isLoading && groups.length === 0 ? (
          <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)] md:col-span-2 xl:col-span-3">
            Nenhum parcelamento foi encontrado para os filtros selecionados.
          </div>
        ) : null}
      </section>
    </div>
  );
}
