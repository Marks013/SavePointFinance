"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn, formatCurrency } from "@/lib/utils";
import { transactionFormSchema, type TransactionFiltersValues, type TransactionFormValues } from "@/features/transactions/schemas/transaction-schema";

type CategoryItem = {
  id: string;
  name: string;
  type: "income" | "expense";
  color: string;
};

type AccountItem = {
  id: string;
  name: string;
  type: string;
  balance: number;
  currency: string;
  color: string;
};

type CardItem = {
  id: string;
  name: string;
  brand: string;
  last4?: string | null;
};

type TransactionItem = {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: "income" | "expense" | "transfer";
  paymentMethod: string;
  installmentsTotal: number;
  installmentNumber: number;
  category: { id: string; name: string; color: string } | null;
  account: { id: string; name: string } | null;
  destinationAccount: { id: string; name: string } | null;
  card: { id: string; name: string } | null;
  notes?: string | null;
  titheAmount: number | null;
  applyTithe: boolean;
  classification: {
    auto: boolean;
    ai: boolean;
    confidence: number | null;
  } | null;
};

type ReviewSelectionState = Record<string, string>;

async function getCategories() {
  const response = await fetch("/api/categories", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar categorias");
  return (await response.json()) as { items: CategoryItem[] };
}

async function getAccounts() {
  const response = await fetch("/api/accounts", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar contas");
  return (await response.json()) as { items: AccountItem[] };
}

async function getTransactionsWithFilters(filters: TransactionFiltersValues) {
  const searchParams = new URLSearchParams({
    limit: "30"
  });

  if (filters.from) searchParams.set("from", filters.from);
  if (filters.to) searchParams.set("to", filters.to);
  if (filters.type) searchParams.set("type", filters.type);
  if (filters.categoryId) searchParams.set("categoryId", filters.categoryId);
  if (filters.accountId) searchParams.set("accountId", filters.accountId);
  if (filters.cardId) searchParams.set("cardId", filters.cardId);

  const response = await fetch(`/api/transactions?${searchParams.toString()}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar transacoes");
  return (await response.json()) as { items: TransactionItem[] };
}

async function getCards() {
  const response = await fetch("/api/cards", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar cartoes");
  return (await response.json()) as { items: CardItem[] };
}

async function createTransaction(values: TransactionFormValues) {
  const response = await fetch("/api/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });

  if (!response.ok) {
    throw new Error("Falha ao criar transacao");
  }

  return response.json();
}

async function updateTransaction(id: string, values: TransactionFormValues) {
  const response = await fetch(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });

  if (!response.ok) {
    throw new Error("Falha ao atualizar transacao");
  }

  return response.json();
}

async function deleteTransaction(id: string) {
  const response = await fetch(`/api/transactions/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    throw new Error("Falha ao excluir transacao");
  }
}

async function reviewClassification(id: string, categoryId: string, applyToInstallments = false) {
  const response = await fetch(`/api/transactions/${id}/classification`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ categoryId, applyToInstallments })
  });

  if (!response.ok) {
    throw new Error("Falha ao revisar classificação");
  }

  return response.json();
}

function formatTransactionTypeLabel(type: TransactionItem["type"]) {
  switch (type) {
    case "income":
      return "Receita";
    case "expense":
      return "Despesa";
    case "transfer":
      return "Transferência";
    default:
      return type;
  }
}

export function TransactionsClient() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [reviewSelections, setReviewSelections] = useState<ReviewSelectionState>({});
  const [filters, setFilters] = useState<TransactionFiltersValues>({
    limit: 30,
    from: "",
    to: "",
    type: undefined,
    categoryId: "",
    accountId: "",
    cardId: ""
  });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const cardsQuery = useQuery({ queryKey: ["cards"], queryFn: getCards });
  const transactionsQuery = useQuery({
    queryKey: ["transactions", filters],
    queryFn: () => getTransactionsWithFilters(filters)
  });
  const transactions = transactionsQuery.data?.items ?? [];
  const expenseTotal = transactions
    .filter((item) => item.type === "expense")
    .reduce((sum, item) => sum + item.amount, 0);
  const incomeTotal = transactions
    .filter((item) => item.type === "income")
    .reduce((sum, item) => sum + item.amount, 0);
  const transferTotal = transactions
    .filter((item) => item.type === "transfer")
    .reduce((sum, item) => sum + item.amount, 0);
  const automaticSuggestions = transactions
    .filter((item) => item.classification?.auto && item.type !== "transfer")
    .sort((a, b) => (a.classification?.confidence ?? 0) - (b.classification?.confidence ?? 0))
    .slice(0, 6);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      amount: 0,
      description: "",
      type: "expense",
      paymentMethod: "pix",
      categoryId: "",
      accountId: "",
      destinationAccountId: "",
      cardId: "",
      notes: "",
      installments: 1,
      applyTithe: false
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (values: TransactionFormValues) => {
      if (editingId) {
        return updateTransaction(editingId, values);
      }

      return createTransaction(values);
    },
    onSuccess: async () => {
      toast.success(editingId ? "Transacao atualizada" : "Transacao criada");
      setEditingId(null);
      form.reset({
        date: new Date().toISOString().slice(0, 10),
        amount: 0,
        description: "",
        type: "expense",
        paymentMethod: "pix",
        categoryId: "",
        accountId: "",
        destinationAccountId: "",
        cardId: "",
        notes: "",
        installments: 1,
        applyTithe: false
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["cards"] }),
        queryClient.invalidateQueries({ queryKey: ["installments"] }),
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] })
      ]);
    },
    onError: () => {
      toast.error(editingId ? "Não foi possível atualizar a transação" : "Não foi possível criar a transação");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: async () => {
      toast.success("Transação excluída");
      if (editingId) {
        setEditingId(null);
        form.reset({
          date: new Date().toISOString().slice(0, 10),
          amount: 0,
          description: "",
          type: "expense",
          paymentMethod: "pix",
          categoryId: "",
          accountId: "",
          destinationAccountId: "",
          cardId: "",
          notes: "",
          installments: 1,
          applyTithe: false
        });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["cards"] }),
        queryClient.invalidateQueries({ queryKey: ["installments"] }),
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] })
      ]);
    },
    onError: () => {
      toast.error("Não foi possível excluir a transação");
    }
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      id,
      categoryId,
      applyToInstallments
    }: {
      id: string;
      categoryId: string;
      applyToInstallments?: boolean;
    }) => reviewClassification(id, categoryId, applyToInstallments),
    onSuccess: async (_, variables) => {
      toast.success("Classificação revisada");
      setReviewSelections((current) => {
        const next = { ...current };
        delete next[variables.id];
        return next;
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: () => {
      toast.error("Não foi possível revisar a classificação");
    }
  });

  const startEditing = (transaction: TransactionItem) => {
    setEditingId(transaction.id);
    form.reset({
      date: new Date(transaction.date).toISOString().slice(0, 10),
      amount: transaction.amount,
      description: transaction.description,
      type: transaction.type,
      paymentMethod: transaction.paymentMethod as TransactionFormValues["paymentMethod"],
      categoryId: transaction.category?.id ?? "",
      accountId: transaction.account?.id ?? "",
      destinationAccountId: transaction.destinationAccount?.id ?? "",
      cardId: transaction.card?.id ?? "",
      notes: transaction.notes ?? "",
      installments: transaction.installmentsTotal,
      applyTithe: transaction.applyTithe
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    form.reset({
      date: new Date().toISOString().slice(0, 10),
      amount: 0,
      description: "",
      type: "expense",
      paymentMethod: "pix",
      categoryId: "",
      accountId: "",
      destinationAccountId: "",
      cardId: "",
      notes: "",
      installments: 1,
      applyTithe: false
    });
  };

  const selectedType = form.watch("type");
  const selectedPaymentMethod = form.watch("paymentMethod");
  const selectedApplyTithe = form.watch("applyTithe");
  const isEditing = editingId !== null;
  const filteredCategories = (categoriesQuery.data?.items ?? []).filter((category) => {
    if (selectedType === "transfer") {
      return true;
    }
    return category.type === selectedType;
  });
  const isCreditCard = selectedPaymentMethod === "credit_card";

  useEffect(() => {
    if (selectedType === "transfer") {
      form.setValue("cardId", "");
      form.setValue("installments", 1);
      form.setValue("applyTithe", false);
      return;
    }

    form.setValue("destinationAccountId", "");
  }, [form, selectedType]);

  useEffect(() => {
    if (isCreditCard) {
      form.setValue("accountId", "");
      return;
    }

    form.setValue("cardId", "");
    form.setValue("installments", 1);
  }, [form, isCreditCard]);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="surface content-section">
        <div className="page-intro">
          <div className="eyebrow">{isEditing ? "Editar transação" : "Nova transação"}</div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em]">Operacao financeira</h1>
          <p className="text-sm leading-7 text-[var(--color-muted-foreground)]">
            Registre lançamentos, vincule contas ou cartões e mantenha o histórico financeiro conectado ao painel,
            à fatura e aos relatórios.
          </p>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted-foreground)]">
            Se a categoria não for informada, o sistema tenta classificar automaticamente com base no contexto do
            lançamento e em padrões brasileiros de consumo.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input id="date" type="date" {...form.register("date")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Valor</Label>
              <CurrencyInput control={form.control} id="amount" name="amount" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" placeholder="Ex.: Supermercado" {...form.register("description")} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Select id="type" {...form.register("type")}>
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
                <option value="transfer">Transferência</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Pagamento</Label>
              <Select id="paymentMethod" {...form.register("paymentMethod")}>
                <option value="pix">PIX</option>
                <option value="money">Dinheiro</option>
                <option value="debit_card">Cartão de débito</option>
                <option value="credit_card">Cartão de crédito</option>
                <option value="transfer">Transferência</option>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="categoryId">Categoria</Label>
              <Select id="categoryId" {...form.register("categoryId")}>
                <option value="">
                  {selectedType === "transfer"
                    ? "Transferências não usam categoria"
                    : "Classificar automaticamente"}
                </option>
                {filteredCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={isCreditCard ? "cardId" : "accountId"}>
                {isCreditCard ? "Cartão vinculado" : selectedType === "transfer" ? "Conta de origem" : "Conta vinculada"}
              </Label>
              {isCreditCard ? (
                <Select id="cardId" {...form.register("cardId")}>
                  <option value="">Selecione o cartão</option>
                  {(cardsQuery.data?.items ?? []).map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name} {card.last4 ? `• ${card.last4}` : ""}
                    </option>
                  ))}
                </Select>
              ) : (
                <Select id="accountId" {...form.register("accountId")}>
                  <option value="">Selecione a conta</option>
                  {(accountsQuery.data?.items ?? []).map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>

          {selectedType === "transfer" ? (
            <div className="space-y-2">
              <Label htmlFor="destinationAccountId">Conta de destino</Label>
              <Select id="destinationAccountId" {...form.register("destinationAccountId")}>
                <option value="">Selecione a conta de destino</option>
                {(accountsQuery.data?.items ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[1fr_120px]">
            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Input id="notes" placeholder="Opcional" {...form.register("notes")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="installments">Parcelas</Label>
              <Input
                disabled={isEditing || !isCreditCard}
                id="installments"
                min={1}
                type="number"
                {...form.register("installments")}
              />
            </div>
          </div>

          {selectedType === "income" ? (
            <label className="muted-panel flex items-center gap-3 text-sm">
              <input className="app-checkbox" type="checkbox" {...form.register("applyTithe")} />
              Considerar dízimo nesta receita
            </label>
          ) : null}

          <div className="attention-panel text-sm leading-7 text-[var(--color-foreground)]">
            {isCreditCard
              ? "Compras no crédito ficam vinculadas ao cartão e entram no controle de fatura e limite."
              : selectedType === "transfer"
                ? "Transferências usam a conta de origem e não entram como despesa de cartão."
              : selectedType === "income" && selectedApplyTithe
                ? "Esta receita entrará no consolidado mensal de dízimo, gerando uma única despesa somada no período."
                : "Despesas e receitas devem ficar vinculadas à conta correta para melhorar relatórios e conciliação."}
          </div>

          {isEditing ? (
            <p className="warning-copy text-sm">
              Edição de parcelas em lote ainda não foi habilitada. O valor atual é mantido para referência.
            </p>
          ) : null}

          {form.formState.errors.accountId ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.accountId.message}</p>
          ) : null}

          {form.formState.errors.cardId ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.cardId.message}</p>
          ) : null}

          {form.formState.errors.destinationAccountId ? (
            <p className="text-sm text-[var(--color-destructive)]">
              {form.formState.errors.destinationAccountId.message}
            </p>
          ) : null}

          {form.formState.errors.categoryId ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.categoryId.message}</p>
          ) : null}

          {form.formState.errors.paymentMethod ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.paymentMethod.message}</p>
          ) : null}

          <Button className="w-full" disabled={saveMutation.isPending} type="submit">
            {saveMutation.isPending ? "Salvando..." : isEditing ? "Salvar transação" : "Registrar transação"}
          </Button>
          {isEditing ? (
            <Button className="w-full" onClick={cancelEditing} type="button" variant="ghost">
              Cancelar edição
            </Button>
          ) : null}
        </form>
      </section>

      <section className="surface content-section">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Últimas transações</div>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">Movimentações recentes</h2>
          </div>
          <Button
            onClick={() => transactionsQuery.refetch()}
            type="button"
            variant="secondary"
          >
            Atualizar
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className="metric-card">
            <p className="metric-label">Receitas filtradas</p>
            <p className="metric-value">{formatCurrency(incomeTotal)}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Despesas filtradas</p>
            <p className="metric-value">{formatCurrency(expenseTotal)}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Transferências filtradas</p>
            <p className="metric-value">{formatCurrency(transferTotal)}</p>
          </article>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="metric-label">Sugestões para revisar</p>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                Classificações automáticas recentes, priorizando as de menor confiança.
              </p>
            </div>
            <p className="text-sm font-medium text-[var(--color-muted-foreground)]">
              {automaticSuggestions.length} em análise
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {automaticSuggestions.length ? (
              automaticSuggestions.map((transaction) => {
                const selectedCategoryId = reviewSelections[transaction.id] ?? transaction.category?.id ?? "";
                const reviewCategories = (categoriesQuery.data?.items ?? []).filter(
                  (item) => item.type === transaction.type
                );

                return (
                  <article key={`review-${transaction.id}`} className="data-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{transaction.description}</p>
                        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                          {new Date(transaction.date).toLocaleDateString("pt-BR")} • {formatCurrency(transaction.amount)} •{" "}
                          {transaction.account?.name ?? transaction.card?.name ?? "Sem origem"}
                        </p>
                        <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                          Sugerido: {transaction.category?.name ?? "Sem categoria"}{" "}
                          {transaction.classification?.ai ? "por IA" : "por regras"} • confiança{" "}
                          {Math.round((transaction.classification?.confidence ?? 0) * 100)}%
                        </p>
                      </div>
                      <div className="grid gap-2 lg:min-w-[280px]">
                        <Select
                          value={selectedCategoryId}
                          onChange={(event) =>
                            setReviewSelections((current) => ({
                              ...current,
                              [transaction.id]: event.target.value
                            }))
                          }
                        >
                          <option value="">Selecione a categoria</option>
                          {reviewCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </Select>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={!transaction.category?.id || reviewMutation.isPending}
                            onClick={() =>
                              reviewMutation.mutate({
                                id: transaction.id,
                                categoryId: transaction.category?.id ?? "",
                                applyToInstallments: false
                              })
                            }
                            type="button"
                            variant="secondary"
                          >
                            Confirmar sugestão
                          </Button>
                          <Button
                            disabled={!selectedCategoryId || reviewMutation.isPending}
                            onClick={() =>
                              reviewMutation.mutate({
                                id: transaction.id,
                                categoryId: selectedCategoryId,
                                applyToInstallments: false
                              })
                            }
                            type="button"
                          >
                            Aplicar categoria
                          </Button>
                          {transaction.installmentsTotal > 1 ? (
                            <Button
                              disabled={!selectedCategoryId || reviewMutation.isPending}
                              onClick={() =>
                                reviewMutation.mutate({
                                  id: transaction.id,
                                  categoryId: selectedCategoryId,
                                  applyToInstallments: true
                                })
                              }
                              type="button"
                              variant="ghost"
                            >
                              Aplicar ao parcelamento
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
                Nenhuma classificação automática pendente de revisão nesta amostra recente.
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="transactions-filter-from">De</Label>
            <Input
              id="transactions-filter-from"
              type="date"
              value={filters.from ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transactions-filter-to">Até</Label>
            <Input
              id="transactions-filter-to"
              type="date"
              value={filters.to ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="transactions-filter-type">Tipo</Label>
            <Select
              id="transactions-filter-type"
              value={filters.type ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  type: event.target.value ? (event.target.value as TransactionFiltersValues["type"]) : undefined
                }))
              }
            >
              <option value="">Todos</option>
              <option value="expense">Despesa</option>
              <option value="income">Receita</option>
              <option value="transfer">Transferência</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="transactions-filter-category">Categoria</Label>
            <Select
              id="transactions-filter-category"
              value={filters.categoryId ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}
            >
              <option value="">Todas</option>
              {(categoriesQuery.data?.items ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="transactions-filter-account">Conta</Label>
            <Select
              id="transactions-filter-account"
              value={filters.accountId ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, accountId: event.target.value }))}
            >
              <option value="">Todas</option>
              {(accountsQuery.data?.items ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="transactions-filter-card">Cartão</Label>
            <Select
              id="transactions-filter-card"
              value={filters.cardId ?? ""}
              onChange={(event) => setFilters((current) => ({ ...current, cardId: event.target.value }))}
            >
              <option value="">Todos</option>
              {(cardsQuery.data?.items ?? []).map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="mt-4">
          <Button
            onClick={() =>
              setFilters({
                limit: 30,
                from: "",
                to: "",
                type: undefined,
                categoryId: "",
                accountId: "",
                cardId: ""
              })
            }
            type="button"
            variant="ghost"
          >
            Limpar filtros
          </Button>
        </div>

        <div className="mt-6 space-y-3">
          {transactionsQuery.isLoading ? <p className="text-sm text-[var(--color-muted-foreground)]">Carregando...</p> : null}
          {transactions.map((transaction) => (
            <article
              key={transaction.id}
              className="data-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "type-badge",
                        transaction.type === "income"
                          ? "type-badge-income"
                          : transaction.type === "expense"
                            ? "type-badge-expense"
                            : "type-badge-transfer"
                      )}
                    >
                      {formatTransactionTypeLabel(transaction.type)}
                    </span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">
                      {new Date(transaction.date).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <p className="mt-3 text-base font-semibold">{transaction.description}</p>
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                    {transaction.type === "transfer"
                      ? `${transaction.account?.name ?? "Sem origem"} → ${transaction.destinationAccount?.name ?? "Sem destino"}`
                      : `${transaction.category?.name ?? "Sem categoria"} • ${transaction.account?.name ?? transaction.card?.name ?? "Sem origem"}`}
                  </p>
                  {transaction.classification?.auto ? (
                    <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                      {transaction.classification.ai ? "Categoria sugerida por IA contextual" : "Categoria sugerida automaticamente"}
                      {typeof transaction.classification.confidence === "number"
                        ? ` • confiança ${Math.round(transaction.classification.confidence * 100)}%`
                        : ""}
                    </p>
                  ) : null}
                  {transaction.titheAmount ? (
                    <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                      Dízimo considerado: {formatCurrency(transaction.titheAmount)}
                    </p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "text-lg font-semibold",
                      transaction.type === "income"
                        ? "text-[var(--color-primary)]"
                        : transaction.type === "expense"
                          ? "text-[var(--color-coral-500)]"
                          : "text-[var(--color-foreground)]"
                    )}
                  >
                    {formatCurrency(transaction.amount)}
                  </p>
                  {transaction.installmentsTotal > 1 ? (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {transaction.installmentNumber}/{transaction.installmentsTotal}
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button onClick={() => startEditing(transaction)} type="button" variant="secondary">
                      Editar
                    </Button>
                    <Button
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(transaction.id)}
                      type="button"
                      variant="ghost"
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          ))}

          {!transactionsQuery.isLoading && transactions.length === 0 ? (
            <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
              Nenhuma transação foi encontrada para os filtros selecionados.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
