"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDateKey } from "@/lib/date";
import { FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS } from "@/lib/finance/benefit-wallet-rules";
import { formatMonthKeyLabel, normalizeMonthKey } from "@/lib/month";
import { ensureApiResponse } from "@/lib/observability/http";
import { formatCurrency } from "@/lib/utils";

type BenefitAccountItem = {
  id: string;
  name: string;
  usage: "standard" | "benefit_food";
  balance: number;
  openingBalance: number;
  periodIncome: number;
  periodExpense: number;
  periodNet: number;
  color: string;
  institution?: string | null;
};

type CategoryItem = {
  id: string;
  name: string;
  systemKey: string | null;
  type: "income" | "expense";
};

type TransactionItem = {
  id: string;
  date: string;
  amount: number;
  description: string;
  type: "income" | "expense" | "transfer";
  paymentMethod: string;
  category: { id: string; name: string } | null;
  account: { id: string; name: string; usage?: "standard" | "benefit_food" } | null;
};

type SubscriptionItem = {
  id: string;
  name: string;
  amount: number;
  billingDay: number;
  nextBillingDate: string;
  type: "income" | "expense";
  isActive: boolean;
  autoTithe: boolean;
  account: { id: string; name: string; usage?: "standard" | "benefit_food" } | null;
};

type ProfilePreferencesPayload = {
  preferences: {
    autoTithe: boolean;
  };
};

const walletSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome"),
  balance: z.coerce.number().min(0).default(0)
});

const rechargeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data"),
  amount: z.coerce.number().positive("Informe um valor"),
  description: z.string().trim().min(2, "Informe uma descrição"),
  paymentMethod: z.enum(["pix", "money"]).default("pix"),
  applyTithe: z.boolean().default(false)
});

const consumeSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data"),
  amount: z.coerce.number().positive("Informe um valor"),
  description: z.string().trim().min(2, "Informe uma descrição"),
  paymentMethod: z.enum(["pix", "money", "debit_card"]).default("debit_card"),
  categoryId: z.string().trim().optional().default("")
});

const recurringRechargeSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome"),
  amount: z.coerce.number().positive("Informe um valor"),
  billingDay: z.coerce.number().int().min(1).max(31).default(5),
  nextBillingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a próxima data"),
  autoTithe: z.boolean().default(false)
});

async function getAccounts(month: string) {
  const response = await fetch(`/api/accounts?month=${month}`, { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar contas", method: "GET", path: "/api/accounts" });
  const payload = (await response.json()) as { items: BenefitAccountItem[] };
  return payload.items.filter((account) => account.usage === "benefit_food");
}

async function getCategories() {
  const response = await fetch("/api/categories", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar categorias", method: "GET", path: "/api/categories" });
  const payload = (await response.json()) as { items: CategoryItem[] };
  return payload.items.filter(
    (category) =>
      category.type === "expense" &&
      FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS.some((systemKey) => systemKey === category.systemKey)
  );
}

async function getTransactions(month: string) {
  const response = await fetch(`/api/transactions?month=${month}&limit=100`, { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar transações", method: "GET", path: "/api/transactions" });
  const payload = (await response.json()) as { items: TransactionItem[] };
  return payload.items.filter((item) => item.account?.usage === "benefit_food");
}

async function getSubscriptions(month: string) {
  const response = await fetch(`/api/subscriptions?month=${month}`, { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar recorrências", method: "GET", path: "/api/subscriptions" });
  const payload = (await response.json()) as { items: SubscriptionItem[] };
  return payload.items.filter((item) => item.account?.usage === "benefit_food" && item.type === "income");
}

async function getProfilePreferences() {
  const response = await fetch("/api/profile", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar preferências", method: "GET", path: "/api/profile" });
  return (await response.json()) as ProfilePreferencesPayload;
}

async function createBenefitWallet(values: z.infer<typeof walletSchema>) {
  const response = await fetch("/api/accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: values.name,
      type: "wallet",
      usage: "benefit_food",
      balance: values.balance,
      currency: "BRL",
      color: "#10B981",
      institution: "Benefício"
    })
  });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao criar carteira", method: "POST", path: "/api/accounts" });
  return response.json();
}

async function updateBenefitWallet(accountId: string, values: z.infer<typeof walletSchema>) {
  const response = await fetch(`/api/accounts/${accountId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: values.name,
      type: "wallet",
      usage: "benefit_food",
      balance: values.balance,
      currency: "BRL",
      color: "#10B981",
      institution: "Benefício"
    })
  });
  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao atualizar carteira",
    method: "PATCH",
    path: `/api/accounts/${accountId}`
  });
  return response.json();
}

async function deleteBenefitWallet(accountId: string) {
  const response = await fetch(`/api/accounts/${accountId}`, {
    method: "DELETE"
  });
  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao excluir carteira",
    method: "DELETE",
    path: `/api/accounts/${accountId}`
  });
}

async function createRecharge(accountId: string, values: z.infer<typeof rechargeSchema>) {
  const response = await fetch("/api/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      date: values.date,
      amount: values.amount,
      description: values.description,
      type: "income",
      paymentMethod: values.paymentMethod,
      categoryId: "",
      accountId,
      destinationAccountId: "",
      cardId: "",
      notes: "",
      installments: 1,
      applyTithe: values.applyTithe
    })
  });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao registrar recarga", method: "POST", path: "/api/transactions" });
  return response.json();
}

async function createConsumption(accountId: string, values: z.infer<typeof consumeSchema>) {
  const response = await fetch("/api/transactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      date: values.date,
      amount: values.amount,
      description: values.description,
      type: "expense",
      paymentMethod: values.paymentMethod,
      categoryId: values.categoryId ?? "",
      accountId,
      destinationAccountId: "",
      cardId: "",
      notes: "",
      installments: 1,
      applyTithe: false
    })
  });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao registrar consumo", method: "POST", path: "/api/transactions" });
  return response.json();
}

async function createRecurringRecharge(accountId: string, values: z.infer<typeof recurringRechargeSchema>) {
  const response = await fetch("/api/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      name: values.name,
      amount: values.amount,
      billingDay: values.billingDay,
      categoryId: "",
      accountId,
      cardId: "",
      nextBillingDate: values.nextBillingDate,
      type: "income",
      isActive: true,
      autoTithe: values.autoTithe
    })
  });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao criar recorrência", method: "POST", path: "/api/subscriptions" });
  return response.json();
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

export function BenefitFoodClient() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const month = normalizeMonthKey(searchParams.get("month"));
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const today = useMemo(() => formatDateKey(new Date()), []);
  const walletForm = useForm<z.input<typeof walletSchema>, unknown, z.infer<typeof walletSchema>>({
    resolver: zodResolver(walletSchema),
    defaultValues: {
      name: "Auxílio Alimentação",
      balance: 0
    }
  });
  const rechargeForm = useForm<z.input<typeof rechargeSchema>, unknown, z.infer<typeof rechargeSchema>>({
    resolver: zodResolver(rechargeSchema),
    defaultValues: {
      date: today,
      amount: 0,
      description: "Recarga Vale Alimentação",
      paymentMethod: "pix",
      applyTithe: false
    }
  });
  const consumeForm = useForm<z.input<typeof consumeSchema>, unknown, z.infer<typeof consumeSchema>>({
    resolver: zodResolver(consumeSchema),
    defaultValues: {
      date: today,
      amount: 0,
      description: "",
      paymentMethod: "debit_card",
      categoryId: ""
    }
  });
  const recurringForm = useForm<
    z.input<typeof recurringRechargeSchema>,
    unknown,
    z.infer<typeof recurringRechargeSchema>
  >({
    resolver: zodResolver(recurringRechargeSchema),
    defaultValues: {
      name: "Recarga mensal Vale Alimentação",
      amount: 0,
      billingDay: 5,
      nextBillingDate: today,
      autoTithe: false
    }
  });

  const accountsQuery = useQuery({ queryKey: ["benefit-accounts", month], queryFn: () => getAccounts(month) });
  const categoriesQuery = useQuery({ queryKey: ["benefit-categories"], queryFn: getCategories, staleTime: 60_000 });
  const transactionsQuery = useQuery({ queryKey: ["benefit-transactions", month], queryFn: () => getTransactions(month) });
  const subscriptionsQuery = useQuery({ queryKey: ["benefit-subscriptions", month], queryFn: () => getSubscriptions(month) });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfilePreferences, staleTime: 30_000 });

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const transactions = useMemo(() => transactionsQuery.data ?? [], [transactionsQuery.data]);
  const recurringRecharges = useMemo(() => subscriptionsQuery.data ?? [], [subscriptionsQuery.data]);
  const preferredAutoTithe = Boolean(profileQuery.data?.preferences.autoTithe);
  const activeAccountId =
    selectedAccountId && accounts.some((account) => account.id === selectedAccountId)
      ? selectedAccountId
      : (accounts[0]?.id ?? "");

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === activeAccountId) ?? null,
    [accounts, activeAccountId]
  );
  const visibleTransactions = useMemo(
    () => transactions.filter((item) => !activeAccountId || item.account?.id === activeAccountId).slice(0, 8),
    [activeAccountId, transactions]
  );
  const visibleRecurringRecharges = useMemo(
    () => recurringRecharges.filter((item) => !activeAccountId || item.account?.id === activeAccountId),
    [recurringRecharges, activeAccountId]
  );
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const totalCredits = accounts.reduce((sum, account) => sum + account.periodIncome, 0);
  const totalConsumption = accounts.reduce((sum, account) => sum + account.periodExpense, 0);

  useEffect(() => {
    if (!rechargeForm.getFieldState("applyTithe").isDirty) {
      rechargeForm.setValue("applyTithe", preferredAutoTithe);
    }

    if (!recurringForm.getFieldState("autoTithe").isDirty) {
      recurringForm.setValue("autoTithe", preferredAutoTithe);
    }
  }, [preferredAutoTithe, rechargeForm, recurringForm]);

  useEffect(() => {
    if (selectedAccount) {
      walletForm.reset({
        name: selectedAccount.name,
        balance: selectedAccount.openingBalance
      });
      return;
    }

    walletForm.reset({
      name: "Auxílio Alimentação",
      balance: 0
    });
  }, [selectedAccount, walletForm]);

  const invalidateFinanceViews = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["benefit-accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["benefit-transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["benefit-subscriptions"] }),
      queryClient.invalidateQueries({ queryKey: ["accounts"] }),
      queryClient.invalidateQueries({ queryKey: ["transactions"] }),
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
      queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    ]);
  };

  const walletMutation = useMutation({
    mutationFn: (values: z.infer<typeof walletSchema>) =>
      selectedAccount ? updateBenefitWallet(selectedAccount.id, values) : createBenefitWallet(values),
    onSuccess: async () => {
      toast.success(selectedAccount ? "Carteira de Vale Alimentação atualizada" : "Carteira de Vale Alimentação criada");
      await invalidateFinanceViews();
    },
    onError: (error) => {
      toast.error(selectedAccount ? "Não foi possivel atualizar a carteira" : "Não foi possivel criar a carteira", {
        description: error.message
      });
    }
  });
  const deleteWalletMutation = useMutation({
    mutationFn: deleteBenefitWallet,
    onSuccess: async () => {
      toast.success("Carteira de Vale Alimentação excluída");
      setSelectedAccountId("");
      walletForm.reset({
        name: "Auxílio Alimentação",
        balance: 0
      });
      await invalidateFinanceViews();
    },
    onError: (error) => {
      toast.error("Não foi possivel excluir a carteira", {
        description: error.message
      });
    }
  });

  const rechargeMutation = useMutation({
    mutationFn: (values: z.infer<typeof rechargeSchema>) => createRecharge(activeAccountId, values),
    onSuccess: async () => {
      toast.success("Recarga registrada");
      rechargeForm.reset({
        date: today,
        amount: 0,
        description: "Recarga Vale Alimentação",
        paymentMethod: "pix",
        applyTithe: preferredAutoTithe
      });
      await invalidateFinanceViews();
    },
    onError: (error) => {
      toast.error("Não foi possivel registrar a recarga", {
        description: error.message
      });
    }
  });

  const consumptionMutation = useMutation({
    mutationFn: (values: z.infer<typeof consumeSchema>) => createConsumption(activeAccountId, values),
    onSuccess: async () => {
      toast.success("Consumo registrado");
      consumeForm.reset({
        date: today,
        amount: 0,
        description: "",
        paymentMethod: "debit_card",
        categoryId: ""
      });
      await invalidateFinanceViews();
    },
    onError: (error) => {
      toast.error("Não foi possivel registrar o consumo", {
        description: error.message
      });
    }
  });

  const recurringMutation = useMutation({
    mutationFn: (values: z.infer<typeof recurringRechargeSchema>) => createRecurringRecharge(activeAccountId, values),
    onSuccess: async () => {
      toast.success("Recorrencia de recarga criada");
      recurringForm.reset({
        name: "Recarga mensal Vale Alimentação",
        amount: 0,
        billingDay: 5,
        nextBillingDate: today,
        autoTithe: preferredAutoTithe
      });
      await invalidateFinanceViews();
    },
    onError: (error) => {
      toast.error("Não foi possivel criar a recorrência", {
        description: error.message
      });
    }
  });

  return (
    <div className="grid gap-6">
      <section className="surface content-section">
        <div className="page-intro">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="eyebrow">Vale Alimentação</div>
              <h1 className="text-3xl font-semibold tracking-[-0.04em]">Recarga, consumo e recorrência</h1>
            </div>
            {accounts.length > 0 ? (
              <div className="min-w-[240px] space-y-2">
                <Label htmlFor="benefit-account-selector">Carteira ativa</Label>
                <Select
                  id="benefit-account-selector"
                  value={activeAccountId}
                  onChange={(event) => setSelectedAccountId(event.target.value)}
                >
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>
          <p className="text-sm leading-7 text-[var(--color-muted-foreground)]">
            Esta area separa o benefício do fluxo generico. Use recarga para entrada de saldo, consumo para gastos
            elegíveis e recorrência para automatizar os créditos mensais.
          </p>
          <p className="text-sm font-medium text-[var(--color-primary)]">Mês de análise: {formatMonthKeyLabel(month)}</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="metric-card">
            <p className="metric-label">Saldo do benefício</p>
            <p className="metric-value amount-nowrap">{formatCurrency(totalBalance)}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Recargas no período</p>
            <p className="metric-value amount-nowrap">{formatCurrency(totalCredits)}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Consumos no período</p>
            <p className="metric-value amount-nowrap">{formatCurrency(totalConsumption)}</p>
          </article>
        </div>
      </section>

      <section className="surface content-section">
        <div className="space-y-3">
          <div className="eyebrow">Carteira</div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">
            {selectedAccount ? "Editar carteira do benefício" : "Criar carteira de benefício"}
          </h2>
          <p className="text-sm leading-7 text-[var(--color-muted-foreground)]">
            {selectedAccount
              ? "Aqui você ajusta o nome e o saldo de referência da carteira de Vale Alimentação."
              : "O Vale Alimentação funciona como uma carteira separada. Depois de criar a conta, esta area libera recarga manual, consumo e recorrência."}
          </p>
        </div>
        <form className="mt-6 grid gap-4 md:grid-cols-[1.3fr_1fr_auto]" onSubmit={walletForm.handleSubmit((values) => walletMutation.mutate(values))}>
          <div className="space-y-2">
            <Label htmlFor="benefit-wallet-name">Nome da carteira</Label>
            <Input id="benefit-wallet-name" {...walletForm.register("name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="benefit-wallet-balance">Saldo inicial</Label>
            <CurrencyInput control={walletForm.control} id="benefit-wallet-balance" name="balance" />
          </div>
          <div className="flex items-end gap-2">
            {selectedAccount ? (
              <Button
                className="w-full md:w-auto"
                disabled={walletMutation.isPending || deleteWalletMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Excluir esta carteira removerá também as movimentações e recorrências vinculadas a ela. Deseja continuar?"
                    )
                  ) {
                    deleteWalletMutation.mutate(selectedAccount.id);
                  }
                }}
                type="button"
                variant="ghost"
              >
                {deleteWalletMutation.isPending ? "Excluindo..." : "Excluir carteira"}
              </Button>
            ) : null}
            <Button
              className="w-full md:w-auto"
              disabled={walletMutation.isPending || deleteWalletMutation.isPending}
              type="submit"
            >
              {walletMutation.isPending
                ? selectedAccount
                  ? "Salvando..."
                  : "Criando..."
                : selectedAccount
                  ? "Salvar carteira"
                  : "Criar carteira"}
            </Button>
          </div>
        </form>
        {walletForm.formState.errors.name ? (
          <p className="mt-3 text-sm text-[var(--color-destructive)]">{walletForm.formState.errors.name.message}</p>
        ) : null}
        {walletForm.formState.errors.balance ? (
          <p className="mt-3 text-sm text-[var(--color-destructive)]">{walletForm.formState.errors.balance.message}</p>
        ) : null}
      </section>

      {accounts.length === 0 ? null : (
        <>
          <section className="grid gap-6 xl:grid-cols-2">
            <article className="surface content-section">
              <div className="space-y-3">
                <div className="eyebrow">Recarga manual</div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">Entrada de saldo</h2>
                <p className="text-sm leading-7 text-[var(--color-muted-foreground)]">
                  Registre créditos mensais, ajustes manuais ou repasses avulsos para a carteira selecionada.
                </p>
              </div>
              <form className="mt-6 space-y-4" onSubmit={rechargeForm.handleSubmit((values) => rechargeMutation.mutate(values))}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="benefit-recharge-date">Data</Label>
                    <Input id="benefit-recharge-date" type="date" {...rechargeForm.register("date")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="benefit-recharge-amount">Valor</Label>
                    <CurrencyInput control={rechargeForm.control} id="benefit-recharge-amount" name="amount" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="benefit-recharge-description">Descrição</Label>
                  <Input id="benefit-recharge-description" {...rechargeForm.register("description")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="benefit-recharge-method">Origem da recarga</Label>
                  <Select id="benefit-recharge-method" {...rechargeForm.register("paymentMethod")}>
                    <option value="pix">PIX / repasse</option>
                    <option value="money">Lançamento manual</option>
                  </Select>
                </div>
                <label className="muted-panel flex items-center gap-3 text-sm">
                  <input className="app-checkbox" type="checkbox" {...rechargeForm.register("applyTithe")} />
                  Considerar dízimo nesta recarga
                </label>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Essa opção segue a preferência global de dízimo para novas receitas, igual às demais telas.
                </p>
                <Button className="w-full" disabled={rechargeMutation.isPending || !activeAccountId} type="submit">
                  {rechargeMutation.isPending ? "Salvando..." : "Registrar recarga"}
                </Button>
              </form>
            </article>

            <article className="surface content-section">
              <div className="space-y-3">
                <div className="eyebrow">Consumo</div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">Gasto elegível</h2>
                <p className="text-sm leading-7 text-[var(--color-muted-foreground)]">
                  Registre apenas compras de alimentação permitidas para manter a carteira coerente com o benefício.
                </p>
              </div>
              <form className="mt-6 space-y-4" onSubmit={consumeForm.handleSubmit((values) => consumptionMutation.mutate(values))}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="benefit-consume-date">Data</Label>
                    <Input id="benefit-consume-date" type="date" {...consumeForm.register("date")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="benefit-consume-amount">Valor</Label>
                    <CurrencyInput control={consumeForm.control} id="benefit-consume-amount" name="amount" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="benefit-consume-description">Descrição</Label>
                  <Input id="benefit-consume-description" placeholder="Ex.: Supermercado" {...consumeForm.register("description")} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="benefit-consume-method">Forma de uso</Label>
                    <Select id="benefit-consume-method" {...consumeForm.register("paymentMethod")}>
                      <option value="debit_card">Cartão de débito</option>
                      <option value="pix">PIX</option>
                      <option value="money">Dinheiro</option>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="benefit-consume-category">Categoria de consumo</Label>
                    <Select id="benefit-consume-category" {...consumeForm.register("categoryId")}>
                      <option value="">Selecionar automaticamente</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Se a categoria ficar em branco, a auto-categorização envia para a IA apenas as categorias permitidas
                  deste benefício.
                </p>
                <Button className="w-full" disabled={consumptionMutation.isPending || !activeAccountId} type="submit">
                  {consumptionMutation.isPending ? "Salvando..." : "Registrar consumo"}
                </Button>
              </form>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <article className="surface content-section">
              <div className="space-y-3">
                <div className="eyebrow">Recorrencia</div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">Recarga mensal automática</h2>
                <p className="text-sm leading-7 text-[var(--color-muted-foreground)]">
                  Agende o crédito mensal do benefício sem depender da tela genérica de assinaturas.
                </p>
              </div>
              <form className="mt-6 space-y-4" onSubmit={recurringForm.handleSubmit((values) => recurringMutation.mutate(values))}>
                <div className="space-y-2">
                  <Label htmlFor="benefit-recurring-name">Nome da recorrência</Label>
                  <Input id="benefit-recurring-name" {...recurringForm.register("name")} />
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="benefit-recurring-amount">Valor</Label>
                    <CurrencyInput control={recurringForm.control} id="benefit-recurring-amount" name="amount" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="benefit-recurring-day">Dia da recarga</Label>
                    <Input id="benefit-recurring-day" min={1} max={31} type="number" {...recurringForm.register("billingDay")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="benefit-recurring-date">Primeira execução</Label>
                    <Input id="benefit-recurring-date" type="date" {...recurringForm.register("nextBillingDate")} />
                  </div>
                </div>
                <label className="muted-panel flex items-center gap-3 text-sm">
                  <input className="app-checkbox" type="checkbox" {...recurringForm.register("autoTithe")} />
                  Considerar dízimo automatico nas recargas mensais
                </label>
                <Button className="w-full" disabled={recurringMutation.isPending || !activeAccountId} type="submit">
                  {recurringMutation.isPending ? "Salvando..." : "Criar recorrência"}
                </Button>
              </form>
            </article>

            <article className="surface content-section">
              <div className="space-y-3">
                <div className="eyebrow">Agendadas</div>
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">Recargas existentes</h2>
              </div>
              <div className="mt-6 space-y-3">
                {visibleRecurringRecharges.length > 0 ? (
                  visibleRecurringRecharges.map((item) => (
                    <article className="rounded-[22px] border border-[var(--color-border)] p-4" key={item.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{item.name}</p>
                          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                            Dia {item.billingDay} · próxima execução em {formatDateLabel(item.nextBillingDate)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold">{formatCurrency(item.amount)}</span>
                      </div>
                      <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
                        {item.autoTithe ? "Recorrencia com dízimo automatico." : "Recorrencia sem dízimo automatico."}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Nenhuma recarga recorrente foi configurada para esta carteira.
                  </p>
                )}
              </div>
            </article>
          </section>

          <section className="surface content-section">
            <div className="space-y-3">
              <div className="eyebrow">Histórico</div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Movimentações recentes</h2>
              {selectedAccount ? (
                <p className="text-sm leading-7 text-[var(--color-muted-foreground)]">
                  {selectedAccount.name}: saldo atual {formatCurrency(selectedAccount.balance)} · saldo de referência{" "}
                  {formatCurrency(selectedAccount.openingBalance)}.
                </p>
              ) : null}
            </div>
            <div className="mt-6 space-y-3">
              {visibleTransactions.length > 0 ? (
                visibleTransactions.map((item) => (
                  <article className="rounded-[22px] border border-[var(--color-border)] p-4" key={item.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{item.description}</p>
                        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                          {formatDateLabel(item.date)} · {item.type === "income" ? "Recarga" : "Consumo"}
                          {item.category ? ` · ${item.category.name}` : ""}
                        </p>
                      </div>
                      <span className={item.type === "income" ? "text-sm font-semibold text-[var(--color-primary)]" : "text-sm font-semibold"}>
                        {item.type === "income" ? "+" : "-"}
                        {formatCurrency(item.amount)}
                      </span>
                    </div>
                  </article>
                ))
              ) : (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Nenhuma movimentação de Vale Alimentação foi registrada neste mês.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
