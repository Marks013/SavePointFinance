"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS, isAllowedBenefitFoodCategory } from "@/lib/finance/benefit-wallet-rules";
import { formatDateDisplay, formatDateKey, normalizeCalendarDate } from "@/lib/date";
import { formatMonthKeyLabel, normalizeMonthKey } from "@/lib/month";
import { ensureApiResponse } from "@/lib/observability/http";
import { cn, formatCurrency } from "@/lib/utils";
import {
  transactionFormSchema,
  type TransactionFiltersValues,
  type TransactionFormValues,
  type TransactionUpdateValues
} from "@/features/transactions/schemas/transaction-schema";

type CategoryItem = {
  id: string;
  name: string;
  systemKey?: string | null;
  type: "income" | "expense";
  color: string;
};

type AccountItem = {
  id: string;
  name: string;
  type: string;
  usage?: "standard" | "benefit_food";
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
  competence: string | null;
  competenceDate: string | null;
  payableDate: string | null;
  amount: number;
  description: string;
  type: "income" | "expense" | "transfer";
  paymentMethod: string;
  installmentsTotal: number;
  installmentNumber: number;
  category: { id: string; name: string; color: string } | null;
  account: { id: string; name: string; usage?: "standard" | "benefit_food" } | null;
  destinationAccount: { id: string; name: string; usage?: "standard" | "benefit_food" } | null;
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

type ProfilePreferencesPayload = {
  preferences: {
    autoTithe: boolean;
  };
};

type TransactionFilterState = Omit<TransactionFiltersValues, "month">;

function getBaseInstallmentDescription(description: string) {
  return description.replace(/\s\(\d+\/\d+\)$/, "");
}

async function getCategories() {
  const response = await fetch("/api/categories", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar categorias", method: "GET", path: "/api/categories" });
  return (await response.json()) as { items: CategoryItem[] };
}

async function getAccounts() {
  const response = await fetch("/api/accounts", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar contas", method: "GET", path: "/api/accounts" });
  return (await response.json()) as { items: AccountItem[] };
}

async function getTransactionsWithFilters(filters: TransactionFiltersValues) {
  const searchParams = new URLSearchParams({
    limit: String(filters.limit ?? 30)
  });

  if (filters.month) searchParams.set("month", filters.month);
  if (filters.type) searchParams.set("type", filters.type);
  if (filters.categoryId) searchParams.set("categoryId", filters.categoryId);
  if (filters.accountId) searchParams.set("accountId", filters.accountId);
  if (filters.cardId) searchParams.set("cardId", filters.cardId);

  const response = await fetch(`/api/transactions?${searchParams.toString()}`, { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar transacoes", method: "GET", path: "/api/transactions" });
  return (await response.json()) as {
    items: TransactionItem[];
    summary: {
      totalCount: number;
      returnedCount: number;
      totals: {
        income: number;
        expense: number;
        transfer: number;
      };
    };
  };
}

async function getCards() {
  const response = await fetch("/api/cards", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar cartoes", method: "GET", path: "/api/cards" });
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

  await ensureApiResponse(response, { fallbackMessage: "Falha ao criar transacao", method: "POST", path: "/api/transactions" });

  return response.json();
}

async function updateTransaction(id: string, values: TransactionUpdateValues) {
  const response = await fetch(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });

  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao atualizar transacao",
    method: "PATCH",
    path: `/api/transactions/${id}`
  });

  return response.json();
}

async function deleteTransaction(id: string) {
  const response = await fetch(`/api/transactions/${id}`, {
    method: "DELETE"
  });

  await ensureApiResponse(response, { fallbackMessage: "Falha ao excluir transacao", method: "DELETE", path: `/api/transactions/${id}` });
}

async function reviewClassification(id: string, categoryId: string, applyToInstallments = false) {
  const response = await fetch(`/api/transactions/${id}/classification`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ categoryId, applyToInstallments })
  });
  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao revisar classificacao",
    method: "PATCH",
    path: `/api/transactions/${id}/classification`
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

function getMonthKeyFromDate(value: string) {
  return formatDateKey(new Date(value)).slice(0, 7);
}

function formatAccountOptionLabel(account: AccountItem) {
  return account.usage === "benefit_food" ? `${account.name} • vale alimentação` : account.name;
}

function buildEmptyTransactionValues(monthKey: string): TransactionFormValues {
  return {
    date: new Date(formatDateKey(new Date()) + "T12:00:00"),
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
    competence: monthKey, // Add competence here
    applyTithe: false
  };
}

async function getProfilePreferences() {
  const response = await fetch("/api/profile", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar preferencias", method: "GET", path: "/api/profile" });
  if (!response.ok) throw new Error("Falha ao carregar preferências");
  return (await response.json()) as ProfilePreferencesPayload;
}

const invalidFieldClassName =
  "border-[var(--color-destructive)] focus:border-[var(--color-destructive)] focus:ring-[var(--color-destructive)]/12";

export function TransactionsClient() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const month = normalizeMonthKey(searchParams.get("month"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreditEditLocked, setIsCreditEditLocked] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const formSectionRef = useRef<HTMLElement | null>(null);
  const [editingScope, setEditingScope] = useState<"single" | "group">("single");
  const [editingInstallmentsTotal, setEditingInstallmentsTotal] = useState(1);
  const [reviewSelections, setReviewSelections] = useState<ReviewSelectionState>({});
  const [filters, setFilters] = useState<TransactionFilterState>({
    limit: 30,
    type: undefined,
    categoryId: "",
    accountId: "",
    cardId: ""
  });
  const deferredFilters = useDeferredValue<TransactionFiltersValues>({ ...filters, month });
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories, staleTime: 30_000 });
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts, staleTime: 30_000 });
  const cardsQuery = useQuery({ queryKey: ["cards"], queryFn: getCards, staleTime: 30_000 });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfilePreferences, staleTime: 30_000 });
  const transactionsQuery = useQuery({
    queryKey: ["transactions", deferredFilters],
    queryFn: () => getTransactionsWithFilters(deferredFilters),
    staleTime: 15_000,
    placeholderData: (previousData) => previousData
  });
  const categories = useMemo(() => categoriesQuery.data?.items ?? [], [categoriesQuery.data?.items]);
  const accounts = useMemo(() => accountsQuery.data?.items ?? [], [accountsQuery.data?.items]);
  const cards = useMemo(() => cardsQuery.data?.items ?? [], [cardsQuery.data?.items]);
  const transactions = useMemo(() => transactionsQuery.data?.items ?? [], [transactionsQuery.data?.items]);
  const transactionSummary = transactionsQuery.data?.summary;
  const preferredAutoTithe = Boolean(profileQuery.data?.preferences.autoTithe);
  const automaticSuggestions = useMemo(() => {
    return transactions
      .filter((item) => item.classification?.auto && item.type !== "transfer")
      .sort((a, b) => (a.classification?.confidence ?? 0) - (b.classification?.confidence ?? 0))
      .slice(0, 6);
  }, [transactions]);
  const incomeTotal = transactionSummary?.totals.income ?? 0;
  const expenseTotal = transactionSummary?.totals.expense ?? 0;
  const transferTotal = transactionSummary?.totals.transfer ?? 0;
  const automaticSuggestionIds = useMemo(
    () => new Set(automaticSuggestions.map((item) => item.id)),
    [automaticSuggestions]
  );
  const visibleTransactions = useMemo(
    () => transactions.filter((item) => !automaticSuggestionIds.has(item.id)),
    [automaticSuggestionIds, transactions]
  );
  const scrollEditorIntoView = () => {
    const timeout = window.setTimeout(() => {
      const target = document.getElementById("description");
      const scrollTarget = target ?? formSectionRef.current;

      scrollTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    }, 80);

    return () => window.clearTimeout(timeout);
  };

  const form = useForm<z.input<typeof transactionFormSchema>, unknown, TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: buildEmptyTransactionValues(month) // Pass the 'month' variable
  });

  const saveMutation = useMutation({
    mutationFn: async (values: TransactionFormValues) => {
      if (editingId) {
        return updateTransaction(editingId, {
          ...values,
          editScope: editingScope
        });
      }

      return createTransaction(values);
    },
    onSuccess: async (payload) => {
      const wasEditing = Boolean(editingId);
      toast.success(
        editingId
          ? payload?.scope === "group"
            ? "Grupo de parcelas atualizado"
            : "Transação atualizada"
          : "Transação criada"
      );
      setEditingId(null);
      setIsCreditEditLocked(false);
      if (wasEditing) {
        setIsEditorOpen(false);
      }
      setEditingScope("single");
      setEditingInstallmentsTotal(1);
      form.reset(buildEmptyTransactionValues(month)); // Pass the 'month' variable
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["cards"] }),
        queryClient.invalidateQueries({ queryKey: ["installments"] }),
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] })
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : editingId
            ? "Não foi possível atualizar a transação"
            : "Não foi possível criar a transação"
      );
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: async () => {
      toast.success("Transação excluída");
      if (editingId) {
        setEditingId(null);
        setIsCreditEditLocked(false);
        setIsEditorOpen(false);
        form.reset(buildEmptyTransactionValues(month));
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
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
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] })
      ]);
    },
    onError: () => {
      toast.error("Não foi possível revisar a classificação");
    }
  });

  const startEditing = (transaction: TransactionItem) => {
    setIsEditorOpen(true);
    setEditingId(transaction.id);
    setIsCreditEditLocked(transaction.paymentMethod === "credit_card" || Boolean(transaction.card));
    setEditingScope("single");
    setEditingInstallmentsTotal(transaction.installmentsTotal);
    form.reset({
      date: normalizeCalendarDate(transaction.date),
      amount: transaction.amount,
      description: getBaseInstallmentDescription(transaction.description),
      type: transaction.type,
      paymentMethod: transaction.paymentMethod as TransactionFormValues["paymentMethod"],
      categoryId: transaction.category?.id ?? "",
      accountId: transaction.account?.id ?? "",
      destinationAccountId: transaction.destinationAccount?.id ?? "",
      cardId: transaction.card?.id ?? "",
      notes: transaction.notes ?? "",
      installments: transaction.installmentsTotal,
      competence: transaction.competence ?? getMonthKeyFromDate(transaction.date),
      applyTithe: transaction.applyTithe
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setIsCreditEditLocked(false);
    setIsEditorOpen(false);
    setEditingScope("single");
    setEditingInstallmentsTotal(1);
    form.reset(buildEmptyTransactionValues(month)); // Pass the 'month' variable
  };

  const openCreateForm = () => {
    setEditingId(null);
    setIsCreditEditLocked(false);
    setIsEditorOpen(true);
    setEditingScope("single");
    setEditingInstallmentsTotal(1);
    form.reset(buildEmptyTransactionValues(month)); // Pass the 'month' variable
  };

  const selectedType = useWatch({ control: form.control, name: "type" }) ?? "expense";
  const selectedPaymentMethod = useWatch({ control: form.control, name: "paymentMethod" }) ?? "pix";
  const selectedApplyTithe = useWatch({ control: form.control, name: "applyTithe" }) ?? false;
  const selectedAccountId = useWatch({ control: form.control, name: "accountId" }) ?? "";
  const selectedFilterCard = useMemo(
    () => cards.find((card) => card.id === (filters.cardId ?? "")),
    [cards, filters.cardId]
  );
  const selectedFilterAccount = useMemo(
    () => accounts.find((account) => account.id === (filters.accountId ?? "")),
    [accounts, filters.accountId]
  );
  const selectedFilterCategory = useMemo(
    () => categories.find((category) => category.id === (filters.categoryId ?? "")),
    [categories, filters.categoryId]
  );
  const activeRefinements = useMemo(() => [
    filters.type
      ? filters.type === "income"
        ? "Receitas"
        : filters.type === "expense"
          ? "Despesas"
          : "Transferências"
      : null,
    selectedFilterCategory ? `Categoria: ${selectedFilterCategory.name}` : null,
    selectedFilterAccount ? `Conta: ${selectedFilterAccount.name}` : null,
    selectedFilterCard
      ? `Cartão: ${selectedFilterCard.name}${selectedFilterCard.last4 ? ` • ${selectedFilterCard.last4}` : ""}`
      : null
  ].filter(Boolean) as string[], [filters.type, selectedFilterAccount, selectedFilterCard, selectedFilterCategory]);
  const isEditing = editingId !== null;
  const showEditor = isEditorOpen || isEditing || transactions.length === 0;
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );
  const isBenefitWalletSelected = selectedAccount?.usage === "benefit_food";
  const filteredCategories = useMemo(
    () =>
      categories.filter((category) => {
        if (selectedType === "transfer") {
          return true;
        }

        if (category.type !== selectedType) {
          return false;
        }

        if (isBenefitWalletSelected && selectedType === "expense") {
          return isAllowedBenefitFoodCategory(category.systemKey);
        }

        return true;
      }),
    [categories, isBenefitWalletSelected, selectedType]
  );
  const showTransferTypeOption = !isBenefitWalletSelected;
  const showCreditCardPaymentOption = !isBenefitWalletSelected;
  const showTransferPaymentOption = !isBenefitWalletSelected;
  const showDebitCardPaymentOption = !(isBenefitWalletSelected && selectedType === "income");
  const isBenefitWalletIncome = isBenefitWalletSelected && selectedType === "income";
  const typeFieldLabel = isBenefitWalletSelected ? "Movimentação" : "Tipo";
  const paymentFieldLabel = isBenefitWalletIncome
    ? "Origem da recarga"
    : isBenefitWalletSelected
      ? "Forma de uso"
      : "Pagamento";
  const categoryFieldLabel = isBenefitWalletIncome
    ? "Classificação da recarga"
    : isBenefitWalletSelected
      ? "Categoria de consumo"
      : "Categoria";
  const isCreditCard = selectedPaymentMethod === "credit_card";
  const accountFieldLabel = isCreditCard
    ? "Cartão vinculado"
    : isBenefitWalletIncome
      ? "Carteira do benefício"
      : selectedType === "transfer"
        ? "Conta de origem"
        : isBenefitWalletSelected
          ? "Carteira do benefício"
          : "Conta vinculada";

  useEffect(() => {
    if (isBenefitWalletSelected) {
      if (selectedType === "transfer") {
        form.setValue("type", "expense");
      }

      if (
        selectedPaymentMethod === "credit_card" ||
        (selectedType === "income" && (selectedPaymentMethod === "transfer" || selectedPaymentMethod === "debit_card"))
      ) {
        form.setValue("paymentMethod", "pix");
      }

      form.setValue("destinationAccountId", "");
      form.setValue("cardId", "");
      form.setValue("installments", 1);
    }
  }, [form, isBenefitWalletSelected, selectedPaymentMethod, selectedType]);

  useEffect(() => {
    if (!isBenefitWalletSelected || selectedType !== "expense") {
      return;
    }

    const currentCategoryId = form.getValues("categoryId");
    if (!currentCategoryId) {
      return;
    }

    const currentCategory = categories.find((category) => category.id === currentCategoryId);
    if (currentCategory && !isAllowedBenefitFoodCategory(currentCategory.systemKey)) {
      form.setValue("categoryId", "");
    }
  }, [categories, form, isBenefitWalletSelected, selectedType]);

  useEffect(() => {
    if (selectedType === "transfer") {
      form.setValue("cardId", "");
      form.setValue("installments", 1);
      form.setValue("applyTithe", false);
      return;
    }

    if (selectedType === "income" && !editingId && !form.getFieldState("applyTithe").isDirty) {
      form.setValue("applyTithe", preferredAutoTithe);
    }

    if (selectedType !== "income") {
      form.setValue("applyTithe", false);
    }

    form.setValue("destinationAccountId", "");
  }, [editingId, form, preferredAutoTithe, selectedType]);

  useEffect(() => {
    if (isCreditCard) {
      form.setValue("accountId", "");
      return;
    }

    form.setValue("cardId", "");
    form.setValue("installments", 1);
  }, [form, isCreditCard]);

  useEffect(() => {
    if (!editingId) {
      return;
    }

    return scrollEditorIntoView();
  }, [editingId]);

  return (
    <div className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
      <section className="surface content-section" ref={formSectionRef}>
        <div className="page-intro">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="eyebrow">{isEditing ? "Editar transação" : "Nova transação"}</div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em]">Operação financeira</h1>
            </div>
            {!showEditor ? (
              <Button onClick={openCreateForm} type="button" variant="secondary">
                Nova transação
              </Button>
            ) : null}
          </div>
          <p className="text-sm leading-7 text-[var(--color-muted-foreground)]">
            Registre lançamentos, vincule contas ou cartões e mantenha o histórico financeiro conectado ao painel,
            à fatura e aos relatórios.
          </p>
          <p className="text-sm font-medium text-[var(--color-primary)]">
            Mês de análise: {formatMonthKeyLabel(month)}
          </p>
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted-foreground)]">
            Se a categoria não for informada, o sistema tenta classificar automaticamente com base no contexto do
            lançamento e em padrões brasileiros de consumo.
          </p>
        </div>

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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Data</Label>
              <Input
                className={form.formState.errors.date ? invalidFieldClassName : undefined}
                disabled={isEditing && isCreditEditLocked}
                id="date"
                type="date"
                {...form.register("date")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Valor</Label>
              <CurrencyInput control={form.control} id="amount" name="amount" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Input
              className={form.formState.errors.description ? invalidFieldClassName : undefined}
              id="description"
              placeholder="Ex.: Supermercado"
              {...form.register("description")}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="type">{typeFieldLabel}</Label>
              <Select
                className={form.formState.errors.type ? invalidFieldClassName : undefined}
                disabled={isEditing && isCreditEditLocked}
                id="type"
                {...form.register("type")}
              >
                <option value="expense">{isBenefitWalletSelected ? "Consumo" : "Despesa"}</option>
                <option value="income">{isBenefitWalletSelected ? "Recarga de saldo" : "Receita"}</option>
                {showTransferTypeOption ? <option value="transfer">Transferência</option> : null}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">{paymentFieldLabel}</Label>
              <Select
                className={form.formState.errors.paymentMethod ? invalidFieldClassName : undefined}
                disabled={isEditing && isCreditEditLocked}
                id="paymentMethod"
                {...form.register("paymentMethod")}
              >
                <option value="pix">{isBenefitWalletIncome ? "PIX / repasse" : "PIX"}</option>
                <option value="money">{isBenefitWalletIncome ? "Lançamento manual" : "Dinheiro"}</option>
                {showDebitCardPaymentOption ? <option value="debit_card">Cartão de débito</option> : null}
                {showCreditCardPaymentOption ? <option value="credit_card">Cartão de crédito</option> : null}
                {showTransferPaymentOption ? <option value="transfer">Transferência</option> : null}
              </Select>
              {isBenefitWalletIncome ? (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  Para recarga do benefício, use Receita com PIX ou Dinheiro.
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="categoryId">{categoryFieldLabel}</Label>
              <Select
                className={form.formState.errors.categoryId ? invalidFieldClassName : undefined}
                disabled={isBenefitWalletIncome}
                id="categoryId"
                {...form.register("categoryId")}
              >
                <option value="">
                  {selectedType === "transfer"
                    ? "Transferências não usam categoria"
                    : isBenefitWalletIncome
                      ? "Recargas de benefício não usam categoria"
                    : isBenefitWalletSelected && selectedType === "expense"
                      ? "Selecione uma categoria elegível de alimentação"
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
              <Label htmlFor={isCreditCard ? "cardId" : "accountId"}>{accountFieldLabel}</Label>
              {isCreditCard ? (
                <Select
                  className={form.formState.errors.cardId ? invalidFieldClassName : undefined}
                  disabled={isEditing && isCreditEditLocked}
                  id="cardId"
                  {...form.register("cardId")}
                >
                  <option value="">Selecione o cartão</option>
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.name} {card.last4 ? `• ${card.last4}` : ""}
                    </option>
                  ))}
                </Select>
              ) : (
                <Select
                  className={form.formState.errors.accountId ? invalidFieldClassName : undefined}
                  disabled={isEditing && isCreditEditLocked}
                  id="accountId"
                  {...form.register("accountId")}
                >
                  <option value="">Selecione a conta</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {formatAccountOptionLabel(account)}
                    </option>
                  ))}
                </Select>
              )}
            </div>
          </div>

          {selectedType === "transfer" && !isBenefitWalletSelected ? (
            <div className="space-y-2">
              <Label htmlFor="destinationAccountId">Conta de destino</Label>
              <Select
                className={form.formState.errors.destinationAccountId ? invalidFieldClassName : undefined}
                id="destinationAccountId"
                {...form.register("destinationAccountId")}
              >
                <option value="">Selecione a conta de destino</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {formatAccountOptionLabel(account)}
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
                className={form.formState.errors.installments ? invalidFieldClassName : undefined}
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
              : isBenefitWalletIncome
                ? "Para lançar saldo no Vale Alimentação, use Receita com PIX ou Dinheiro. Categoria não é necessária, e o dízimo é opcional."
              : isBenefitWalletSelected
                ? `Vale Alimentação aceita créditos com dízimo opcional e consumos apenas em ${FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS.length} grupos alimentares elegíveis.`
              : selectedType === "transfer"
                ? "Transferências usam a conta de origem e não entram como despesa de cartão."
              : selectedType === "income" && selectedApplyTithe
                ? "Esta receita entrará no consolidado mensal de dízimo, gerando uma única despesa somada no período."
                : "Despesas e receitas devem ficar vinculadas à conta correta para melhorar relatórios e conciliação."}
          </div>

          {isEditing && isCreditEditLocked ? (
            <div className="warning-copy text-sm">
              Para alterar data, conta ou cartão neste lançamento de crédito, recrie o lançamento.
            </div>
          ) : null}

          {isEditing ? (
            <p className="warning-copy text-sm">
              {editingInstallmentsTotal > 1
                ? "Escolha se a alteração deve afetar apenas esta parcela ou todo o grupo parcelado."
                : "Você está editando uma transação já registrada."}
            </p>
          ) : null}

          {isEditing && editingInstallmentsTotal > 1 ? (
            <div className="space-y-2">
              <Label htmlFor="edit-scope">Aplicar edição</Label>
              <Select id="edit-scope" value={editingScope} onChange={(event) => setEditingScope(event.target.value as "single" | "group")}>
                <option value="single">Somente esta parcela</option>
                <option value="group">Todo o parcelamento</option>
              </Select>
            </div>
          ) : null}

          {form.formState.errors.accountId ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.accountId.message}</p>
          ) : null}

          {form.formState.errors.date ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.date.message}</p>
          ) : null}

          {form.formState.errors.description ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.description.message}</p>
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

          {form.formState.errors.installments ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.installments.message}</p>
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
        ) : (
          <div className="muted-panel mt-8 flex flex-col gap-4 px-4 py-5 text-sm text-[var(--color-muted-foreground)]">
            <p>O editor foi fechado após a última edição concluída.</p>
            <Button className="w-full sm:w-auto" onClick={openCreateForm} type="button" variant="secondary">
              Nova transação
            </Button>
          </div>
        )}
      </section>

      <section className="surface content-section">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="eyebrow">Últimas transações</div>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.03em]">Movimentações recentes</h2>
          </div>
          <Button disabled={transactionsQuery.isFetching} onClick={() => transactionsQuery.refetch()} type="button" variant="secondary">
            {transactionsQuery.isFetching ? "Atualizando..." : "Atualizar"}
          </Button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <article className="metric-card">
            <p className="metric-label">Receitas filtradas</p>
            <p className="metric-value amount-nowrap">{formatCurrency(incomeTotal)}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Despesas filtradas</p>
            <p className="metric-value amount-nowrap amount-negative">{formatCurrency(expenseTotal)}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Transferências filtradas</p>
            <p className="metric-value amount-nowrap">{formatCurrency(transferTotal)}</p>
          </article>
        </div>

        <div className="mt-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="metric-label">Classificações para validar</p>
              <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                Esses lançamentos já foram registrados e entram nos totais do período. Revise apenas a categoria para
                deixar a leitura mais precisa.
              </p>
            </div>
            <p className="shrink-0 text-sm font-medium text-[var(--color-muted-foreground)]">
              {automaticSuggestions.length} aguardando validação
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {automaticSuggestions.length ? (
              automaticSuggestions.map((transaction) => {
                const selectedCategoryId = reviewSelections[transaction.id] ?? transaction.category?.id ?? "";
                const reviewCategories = categories.filter((item) => {
                  if (item.type !== transaction.type) {
                    return false;
                  }

                  if (transaction.account?.usage === "benefit_food" && transaction.type === "expense") {
                    return isAllowedBenefitFoodCategory(item.systemKey);
                  }

                  return true;
                });

                return (
                  <article key={`review-${transaction.id}`} className="data-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold">{transaction.description}</p>
                        <p className="mt-1 break-words text-xs text-[var(--color-muted-foreground)]">
                          {formatDateDisplay(transaction.date)} • {formatCurrency(transaction.amount)} •{" "}
                          {transaction.account?.name ?? transaction.card?.name ?? "Sem origem"}
                        </p>
                        <p className="mt-2 break-words text-xs text-[var(--color-muted-foreground)]">
                          Sugerido: {transaction.category?.name ?? "Sem classificação"}{" "}
                          {transaction.classification?.ai ? "por IA" : "por regras"} • confiança{" "}
                          {Math.round((transaction.classification?.confidence ?? 0) * 100)}%
                        </p>
                      </div>
                      <div className="grid w-full gap-2 lg:min-w-[280px] lg:max-w-[360px]">
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
                            className="min-w-[160px]"
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
                            Manter sugestão
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
                Nenhuma classificação automática recente precisa da sua atenção.
              </div>
            )}
          </div>
        </div>

        <div className="filter-shell mt-6">
          <p className="filter-kicker">Filtragem</p>
          <p className="filter-copy">
            Selecione o filtro desejado para ter mais visibilidade e contexto por Tipo, Categorias, Contas e Cartões.
          </p>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="transactions-filter-type">Tipo</Label>
            <Select
              id="transactions-filter-type"
              value={filters.type ?? ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  type: event.target.value ? (event.target.value as TransactionFilterState["type"]) : undefined
                }))
              }
            >
              <option value="">Todos os tipos</option>
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
              <option value="">Todas as categorias</option>
              {categories.map((category) => (
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
              <option value="">Todas as contas</option>
              {accounts.map((account) => (
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
              <option value="">Todos os cartões</option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name} {card.last4 ? `• ${card.last4}` : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="muted-panel mt-4 flex flex-wrap items-start justify-between gap-3 text-sm">
          <p className="filter-summary-meta shrink-0">{`Base de leitura: ${formatMonthKeyLabel(month)}.`}</p>
          <p className="filter-summary-copy min-w-0 flex-1 break-words text-left sm:text-right">
            {activeRefinements.length > 0 ? activeRefinements.join(" • ") : "Sem recortes adicionais no momento."}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Label htmlFor="transactions-filter-limit">Volume em tela</Label>
            <Select
              id="transactions-filter-limit"
              value={String(filters.limit ?? 30)}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  limit: Number(event.target.value)
                }))
              }
            >
              <option value="30">30 lançamentos</option>
              <option value="60">60 lançamentos</option>
              <option value="100">100 lançamentos</option>
            </Select>
          </div>
          <Button
            onClick={() =>
              setFilters({
                limit: 30,
                type: undefined,
                categoryId: "",
                accountId: "",
                cardId: ""
              })
            }
            type="button"
            variant="ghost"
          >
            Limpar leitura
          </Button>
        </div>

        <div className="mt-6 space-y-3">
          {transactionsQuery.isLoading ? (
            <div className="grid gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`transactions-loading-${index}`}
                  className="muted-panel border border-dashed px-4 py-5 text-sm text-[var(--color-muted-foreground)]"
                >
                  Carregando movimentações do mês ativo...
                </div>
              ))}
            </div>
          ) : null}
          {!transactionsQuery.isLoading && transactionsQuery.isFetching ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Atualizando resultados com os filtros atuais...</p>
          ) : null}
          {!transactionsQuery.isLoading && visibleTransactions.length > 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Mostrando {visibleTransactions.length} movimentações de {transactionSummary?.totalCount ?? visibleTransactions.length} no mês filtrado.
            </p>
          ) : null}
          {visibleTransactions.map((transaction) => (
            <article
              key={transaction.id}
              className="data-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
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
                    <span className="break-words text-xs text-[var(--color-muted-foreground)]">
                      {transaction.card ? `Compra em ${formatDateDisplay(transaction.date)}` : formatDateDisplay(transaction.date)}
                    </span>
                  </div>
                  <p className="mt-3 break-words text-base font-semibold">{transaction.description}</p>
                  <p className="mt-1 break-words text-sm text-[var(--color-muted-foreground)]">
                    {transaction.type === "transfer"
                      ? `${transaction.account?.name ?? "Sem origem"} → ${transaction.destinationAccount?.name ?? "Sem destino"}`
                      : `${transaction.category?.name ?? "Sem categoria"} • ${
                          transaction.account?.usage === "benefit_food"
                            ? `${transaction.account?.name ?? "Sem origem"} • vale alimentação`
                            : transaction.account?.name ?? transaction.card?.name ?? "Sem origem"
                        }`}
                  </p>
                  {transaction.card && transaction.competenceDate && transaction.payableDate ? (
                    <p className="mt-2 break-words text-xs text-[var(--color-muted-foreground)]">
                      Competência {formatMonthKeyLabel(getMonthKeyFromDate(transaction.competenceDate))} • vence{" "}
                      {formatDateDisplay(transaction.payableDate)}
                    </p>
                  ) : null}
                  {transaction.classification?.auto || transaction.titheAmount ? (
                    <p className="mt-2 break-words text-xs text-[var(--color-muted-foreground)]">
                      {transaction.classification?.auto
                        ? transaction.classification.ai
                          ? "Categoria sugerida por IA"
                          : "Categoria sugerida por regra"
                        : null}
                      {transaction.classification?.auto && typeof transaction.classification.confidence === "number"
                        ? ` • confiança ${Math.round(transaction.classification.confidence * 100)}%`
                        : ""}
                    </p>
                  ) : null}
                  {transaction.titheAmount ? (
                    <p className="mt-2 break-words text-xs text-[var(--color-muted-foreground)]">
                      Dízimo {formatCurrency(transaction.titheAmount)}
                    </p>
                  ) : null}
                </div>
                <div className="w-full sm:w-auto sm:text-right">
                  <p
                    className={cn(
                      "amount-nowrap text-lg font-semibold",
                      transaction.type === "income"
                        ? "text-[var(--color-primary)]"
                        : transaction.type === "expense"
                          ? "amount-negative"
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
                  <div className="mt-3 flex flex-wrap gap-2 sm:justify-end">
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

          {!transactionsQuery.isLoading && visibleTransactions.length === 0 ? (
            <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
              Nenhuma transação foi encontrada para os filtros selecionados.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
