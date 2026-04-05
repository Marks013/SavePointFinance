"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PresetChip } from "@/components/ui/preset-chip";
import { Select } from "@/components/ui/select";
import { accountFormSchema, type AccountFormValues } from "@/features/accounts/schemas/account-schema";
import { accountColorPresets, brazilianInstitutions, findPreset } from "@/lib/finance/presets";
import { formatCurrency } from "@/lib/utils";

type AccountItem = {
  id: string;
  name: string;
  type: string;
  balance: number;
  openingBalance: number;
  currency: string;
  color: string;
  institution?: string | null;
};

async function getAccounts() {
  const response = await fetch("/api/accounts", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar contas");
  return (await response.json()) as { items: AccountItem[] };
}

async function createAccount(values: AccountFormValues) {
  const response = await fetch("/api/accounts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });

  if (!response.ok) throw new Error("Falha ao criar conta");
  return response.json();
}

async function updateAccount(id: string, values: AccountFormValues) {
  const response = await fetch(`/api/accounts/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });

  if (!response.ok) throw new Error("Falha ao atualizar conta");
  return response.json();
}

async function deleteAccount(id: string) {
  const response = await fetch(`/api/accounts/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? "Falha ao excluir conta");
  }
}

export function AccountsClient() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const accounts = accountsQuery.data?.items ?? [];
  const activeBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const openingBalance = accounts.reduce((sum, account) => sum + account.openingBalance, 0);
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      name: "",
      type: "checking",
      balance: 0,
      currency: "BRL",
      color: accountColorPresets[0].value,
      institution: brazilianInstitutions[0].value
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (values: AccountFormValues) => {
      if (editingId) {
        return updateAccount(editingId, values);
      }

      return createAccount(values);
    },
    onSuccess: async () => {
      toast.success(editingId ? "Conta atualizada" : "Conta criada");
      setEditingId(null);
      form.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: () => {
      toast.error(editingId ? "Não foi possível atualizar a conta" : "Não foi possível criar a conta");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      toast.success("Conta excluída");
      if (editingId) {
        setEditingId(null);
        form.reset();
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: (error) => {
      toast.error("Não foi possível excluir a conta", {
        description: error.message
      });
    }
  });

  const startEditing = (account: AccountItem) => {
    setEditingId(account.id);
    form.reset({
      name: account.name,
      type: account.type as AccountFormValues["type"],
      balance: account.openingBalance,
      currency: account.currency,
      color: account.color,
      institution: account.institution ?? ""
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    form.reset();
  };

  const isEditing = editingId !== null;
  const selectedColor = form.watch("color");
  const selectedInstitution = form.watch("institution");

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="surface content-section">
        <div className="eyebrow">Contas</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
          {isEditing ? "Editar conta" : "Nova conta financeira"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Cadastre contas bancárias e carteiras usadas no dia a dia. O saldo atual é recalculado a partir do saldo de
          referência mais as movimentações vinculadas a cada conta.
        </p>

        <form className="mt-8 space-y-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <div className="space-y-2">
            <Label htmlFor="account-name">Nome</Label>
            <Input id="account-name" {...form.register("name")} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-type">Tipo</Label>
              <Select id="account-type" {...form.register("type")}>
                <option value="checking">Corrente</option>
                <option value="savings">Poupança</option>
                <option value="investment">Investimento</option>
                <option value="wallet">Carteira</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-balance">Saldo de referência</Label>
              <CurrencyInput control={form.control} id="account-balance" name="balance" />
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="account-currency">Moeda</Label>
              <Select id="account-currency" {...form.register("currency")}>
                <option value="BRL">Real brasileiro (R$)</option>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="account-institution">Instituição</Label>
              <Select id="account-institution" {...form.register("institution")}>
                {brazilianInstitutions.map((institution) => (
                  <option key={institution.value} value={institution.value}>
                    {institution.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Paleta da conta</Label>
            <div className="flex flex-wrap gap-3">
              {accountColorPresets.map((preset) => (
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
          <div className="muted-panel flex flex-wrap items-center gap-3">
            <PresetChip
              active
              background={findPreset(accountColorPresets, selectedColor)?.background ?? "rgba(15,138,95,0.14)"}
              color={findPreset(accountColorPresets, selectedColor)?.color ?? "#0F8A5F"}
              description="Instituição selecionada"
              label={selectedInstitution || "Banco"}
              shortLabel={findPreset(brazilianInstitutions, selectedInstitution)?.shortLabel ?? "BK"}
            />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              A conta ficará identificada visualmente por cor e instituição nas telas de lançamento e resumo.
            </p>
          </div>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            O saldo de referência é usado como base da conta. Para controle financeiro consistente,
            vincule os lançamentos à conta correta no momento do registro.
          </p>
          <Button className="w-full" disabled={saveMutation.isPending} type="submit">
            {saveMutation.isPending ? "Salvando..." : isEditing ? "Salvar conta" : "Criar conta"}
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
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Contas disponíveis</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Use esta visão para conferir o efeito real dos lançamentos por conta.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <article className="metric-card">
              <p className="metric-label">Saldo atual total</p>
              <p className="metric-value">{formatCurrency(activeBalance)}</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Base cadastrada</p>
              <p className="metric-value">{formatCurrency(openingBalance)}</p>
            </article>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {accounts.map((account) => (
            <article key={account.id} className="data-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <PresetChip
                    compact
                    active
                    background={findPreset(accountColorPresets, account.color)?.background ?? "rgba(15,138,95,0.14)"}
                    color={findPreset(accountColorPresets, account.color)?.color ?? account.color}
                    label={account.name}
                    shortLabel={findPreset(brazilianInstitutions, account.institution)?.shortLabel ?? account.name.slice(0, 2).toUpperCase()}
                    swatchOnly
                  />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-[var(--color-foreground)]">{account.name}</p>
                    <p className="text-xs tracking-[0.02em] text-[var(--color-muted-foreground)]">{account.type}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(account.balance)}</p>
                  <p className="text-xs text-[var(--color-muted-foreground)]">Saldo atual</p>
                </div>
              </div>
              {account.institution ? <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">{account.institution}</p> : null}
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                Saldo de referência: {formatCurrency(account.openingBalance)}
              </p>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                Variação operacional: {formatCurrency(account.balance - account.openingBalance)}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => startEditing(account)} type="button" variant="secondary">
                  Editar
                </Button>
                <Button
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(account.id)}
                  type="button"
                  variant="ghost"
                >
                  Excluir
                </Button>
              </div>
            </article>
          ))}
          {!accountsQuery.isLoading && accounts.length === 0 ? (
            <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)] md:col-span-2">
              Nenhuma conta foi cadastrada ainda. Crie ao menos uma conta para centralizar despesas, receitas e
              transferências.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
