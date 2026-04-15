"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PresetChip } from "@/components/ui/preset-chip";
import { Select } from "@/components/ui/select";
import { goalFormSchema, type GoalFormValues } from "@/features/goals/schemas/goal-schema";
import { formatDateDisplay, formatDateKey } from "@/lib/date";
import { categoryColorPresets, findPreset } from "@/lib/finance/presets";
import { ensureApiResponse } from "@/lib/observability/http";
import { formatCurrency } from "@/lib/utils";

type GoalItem = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string | null;
  color: string;
  icon?: string | null;
  isCompleted: boolean;
  progress: number;
  account?: { id: string; name: string } | null;
};

type AccountItem = {
  id: string;
  name: string;
};

async function getGoals() {
  const response = await fetch("/api/goals", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar metas", method: "GET", path: "/api/goals" });
  return (await response.json()) as { items: GoalItem[] };
}

async function getAccounts() {
  const response = await fetch("/api/accounts", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar contas", method: "GET", path: "/api/accounts" });
  return (await response.json()) as { items: AccountItem[] };
}

async function createGoal(values: GoalFormValues) {
  const response = await fetch("/api/goals", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });

  await ensureApiResponse(response, { fallbackMessage: "Falha ao criar meta", method: "POST", path: "/api/goals" });
  return response.json();
}

async function updateGoal(id: string, values: GoalFormValues) {
  const response = await fetch(`/api/goals/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });

  await ensureApiResponse(response, { fallbackMessage: "Falha ao atualizar meta", method: "PATCH", path: `/api/goals/${id}` });
  return response.json();
}

async function deleteGoal(id: string) {
  const response = await fetch(`/api/goals/${id}`, {
    method: "DELETE"
  });

  await ensureApiResponse(response, { fallbackMessage: "Falha ao excluir meta", method: "DELETE", path: `/api/goals/${id}` });
}

export function GoalsClient() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const goalsQuery = useQuery({ queryKey: ["goals"], queryFn: getGoals });
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const goals = goalsQuery.data?.items ?? [];
  const reservedAmount = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const targetAmount = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const completedGoals = goals.filter((goal) => goal.isCompleted).length;
  const form = useForm<z.input<typeof goalFormSchema>, unknown, GoalFormValues>({
    resolver: zodResolver(goalFormSchema),
    defaultValues: {
      name: "",
      targetAmount: 0,
      currentAmount: 0,
      deadline: "",
      color: categoryColorPresets[0].value,
      icon: "",
      accountId: ""
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (values: GoalFormValues) => {
      if (editingId) {
        return updateGoal(editingId, values);
      }

      return createGoal(values);
    },
    onSuccess: async () => {
      const wasEditing = Boolean(editingId);
      toast.success(editingId ? "Meta atualizada" : "Meta criada");
      setEditingId(null);
      if (wasEditing) {
        setIsEditorOpen(false);
      }
      form.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["goals"] })
      ]);
    },
    onError: () => {
      toast.error(editingId ? "Não foi possível atualizar a meta" : "Não foi possível criar a meta");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: async () => {
      toast.success("Meta excluída");
      if (editingId) {
        setEditingId(null);
        setIsEditorOpen(false);
        form.reset();
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["goals"] })
      ]);
    },
    onError: () => {
      toast.error("Não foi possível excluir a meta");
    }
  });

  const startEditing = (goal: GoalItem) => {
    setIsEditorOpen(true);
    setEditingId(goal.id);
    form.reset({
      name: goal.name,
      targetAmount: goal.targetAmount,
      currentAmount: goal.currentAmount,
      deadline: goal.deadline ? formatDateKey(new Date(goal.deadline)) : "",
      color: goal.color,
      icon: goal.icon ?? "",
      accountId: goal.account?.id ?? ""
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
  const showEditor = isEditorOpen || isEditing || goals.length === 0;
  const selectedColor = useWatch({ control: form.control, name: "color" }) ?? categoryColorPresets[0].value;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="surface content-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Metas</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              {isEditing ? "Editar meta" : "Nova meta financeira"}
            </h1>
          </div>
          {!showEditor ? (
            <Button onClick={openCreateForm} type="button" variant="secondary">
              Nova meta
            </Button>
          ) : null}
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Acompanhe objetivos financeiros com valor atual, valor alvo, prazo e vínculo opcional com a conta que sustenta
          essa reserva.
        </p>

        {showEditor ? (
          <form className="mt-8 space-y-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <div className="space-y-2">
              <Label htmlFor="goal-name">Nome</Label>
              <Input id="goal-name" {...form.register("name")} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="goal-target">Valor alvo</Label>
                <CurrencyInput control={form.control} id="goal-target" name="targetAmount" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-current">Valor atual</Label>
                <CurrencyInput control={form.control} id="goal-current" name="currentAmount" />
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="goal-deadline">Prazo</Label>
                <Input id="goal-deadline" type="date" {...form.register("deadline")} />
              </div>
              <div className="space-y-3 md:col-span-2">
                <Label>Cor da meta</Label>
                <div className="flex flex-wrap gap-3">
                  {categoryColorPresets.map((preset) => (
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
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="goal-icon">Ícone</Label>
                <Input id="goal-icon" {...form.register("icon")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-account">Conta vinculada</Label>
              <Select id="goal-account" {...form.register("accountId")}>
                <option value="">Sem conta vinculada</option>
                {(accountsQuery.data?.items ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="muted-panel flex flex-wrap items-center gap-3">
              <PresetChip
                active
                background={findPreset(categoryColorPresets, selectedColor)?.background ?? "rgba(59,130,246,0.14)"}
                color={findPreset(categoryColorPresets, selectedColor)?.color ?? selectedColor}
                label="Meta financeira"
                shortLabel=""
                swatchOnly
              />
              <p className="text-sm text-[var(--color-muted-foreground)]">
                A cor escolhida será usada no progresso da meta e na identificação visual da reserva.
              </p>
            </div>
            <Button className="w-full" disabled={saveMutation.isPending} type="submit">
              {saveMutation.isPending ? "Salvando..." : isEditing ? "Salvar meta" : "Criar meta"}
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
              Nova meta
            </Button>
          </div>
        )}
      </section>

      <section className="surface content-section">
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Metas ativas</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Visualize o avanço acumulado, o volume já reservado e o que ainda falta atingir.
            </p>
          </div>
          <div className="metric-grid-compact">
            <article className="metric-card">
              <p className="metric-label">Reservado</p>
              <p className="metric-value amount-nowrap">{formatCurrency(reservedAmount)}</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Objetivo total</p>
              <p className="metric-value amount-nowrap">{formatCurrency(targetAmount)}</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Concluídas</p>
              <p className="metric-value">{completedGoals}</p>
            </article>
          </div>
        </div>
        <div className="mt-6 space-y-4">
          {goals.map((goal) => (
            <article key={goal.id} className="data-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-3">
                    <PresetChip
                      compact
                      active
                      background={findPreset(categoryColorPresets, goal.color)?.background ?? "rgba(59,130,246,0.14)"}
                      color={findPreset(categoryColorPresets, goal.color)?.color ?? goal.color}
                      label={goal.name}
                      shortLabel=""
                      swatchOnly
                    />
                    <p className="break-words text-sm font-medium text-[var(--color-foreground)]">{goal.name}</p>
                  </div>
                  <p className="mt-2 break-words text-sm text-[var(--color-muted-foreground)]">
                    {formatCurrency(goal.currentAmount)} de {formatCurrency(goal.targetAmount)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-[var(--color-foreground)]">
                  {Math.round(goal.progress * 100)}%
                </span>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--color-secondary)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(goal.progress * 100, 100)}%`,
                    backgroundColor: goal.color
                  }}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-3 text-sm text-[var(--color-muted-foreground)]">
                <span className="min-w-0 break-words">{goal.account?.name ?? "Sem conta vinculada"}</span>
                <span className="shrink-0">
                  {goal.deadline ? formatDateDisplay(goal.deadline) : "Sem prazo"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => startEditing(goal)} type="button" variant="secondary">
                  Editar
                </Button>
                <Button
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(goal.id)}
                  type="button"
                  variant="ghost"
                >
                  Excluir
                </Button>
              </div>
            </article>
          ))}
          {!goalsQuery.isLoading && goals.length === 0 ? (
            <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
              Nenhuma meta foi cadastrada ainda. Use metas para reservar valores e acompanhar objetivos no dashboard.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
