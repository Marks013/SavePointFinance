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
import { categoryFormSchema, type CategoryFormValues } from "@/features/categories/schemas/category-schema";
import { categoryColorPresets, findPreset } from "@/lib/finance/presets";

type CategoryItem = {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: "income" | "expense";
  isDefault: boolean;
  monthlyLimit: number | null;
  keywords: string[];
};

async function getCategories() {
  const response = await fetch("/api/categories", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar categorias");
  return (await response.json()) as { items: CategoryItem[] };
}

async function createCategory(values: CategoryFormValues) {
  const response = await fetch("/api/categories", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? "Falha ao criar categoria");
  }
  return response.json();
}

async function updateCategory(id: string, values: CategoryFormValues) {
  const response = await fetch(`/api/categories/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? "Falha ao atualizar categoria");
  }
  return response.json();
}

async function deleteCategory(id: string) {
  const response = await fetch(`/api/categories/${id}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? "Falha ao excluir categoria");
  }
}

async function restoreDefaultCategories() {
  const response = await fetch("/api/categories/defaults", {
    method: "POST"
  });

  if (!response.ok) {
    const payload = (await response.json()) as { message?: string };
    throw new Error(payload.message ?? "Falha ao restaurar categorias padrão");
  }

  return (await response.json()) as { restored: number; total: number };
}

export function CategoriesClient() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const categories = categoriesQuery.data?.items ?? [];
  const expenseCategories = categories.filter((category) => category.type === "expense").length;
  const incomeCategories = categories.filter((category) => category.type === "income").length;
  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      icon: "tag",
      color: categoryColorPresets[0].value,
      type: "expense",
      monthlyLimit: null,
      keywords: ""
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CategoryFormValues) => {
      if (editingId) {
        return updateCategory(editingId, values);
      }

      return createCategory(values);
    },
    onSuccess: async () => {
      toast.success(editingId ? "Categoria atualizada" : "Categoria criada");
      setEditingId(null);
      form.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: (error) => {
      toast.error(editingId ? "Não foi possível atualizar a categoria" : "Não foi possível criar a categoria", {
        description: error.message
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: async () => {
      toast.success("Categoria excluída");
      if (editingId) {
        setEditingId(null);
        form.reset();
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: (error) => {
      toast.error("Não foi possível excluir a categoria", {
        description: error.message
      });
    }
  });

  const restoreDefaultsMutation = useMutation({
    mutationFn: restoreDefaultCategories,
    onSuccess: async (payload) => {
      toast.success("Categorias padrão restauradas", {
        description:
          payload.restored > 0
            ? `${payload.restored} categoria(s) adicionada(s) sem duplicar as existentes.`
            : "Nenhuma categoria nova foi adicionada porque a base já estava completa."
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: (error) => {
      toast.error("Não foi possível restaurar as categorias padrão", {
        description: error.message
      });
    }
  });

  const startEditing = (category: CategoryItem) => {
    setEditingId(category.id);
    form.reset({
      name: category.name,
      icon: category.icon,
      color: category.color,
      type: category.type,
      monthlyLimit: category.monthlyLimit,
      keywords: category.keywords.join(", ")
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    form.reset();
  };

  const isEditing = editingId !== null;
  const selectedColor = form.watch("color");
  const selectedType = form.watch("type");

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="surface content-section">
        <div className="eyebrow">Categorias</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
          {isEditing ? "Editar categoria" : "Nova categoria"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Cadastre categorias claras para organizar lançamentos e melhorar os relatórios.
        </p>

        <form className="mt-8 space-y-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
          <div className="space-y-2">
            <Label htmlFor="category-name">Nome</Label>
            <Input id="category-name" {...form.register("name")} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category-type">Tipo</Label>
              <Select id="category-type" {...form.register("type")}>
                <option value="expense">Despesa</option>
                <option value="income">Receita</option>
              </Select>
            </div>
            <div className="space-y-3">
              <Label>Cor da categoria</Label>
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
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="category-icon">Ícone</Label>
              <Input id="category-icon" {...form.register("icon")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category-monthly-limit">Limite mensal</Label>
              <CurrencyInput
                control={form.control}
                id="category-monthly-limit"
                name="monthlyLimit"
                nullable
                placeholder="Opcional"
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-1">
            <div className="space-y-2">
              <Label htmlFor="category-keywords">Palavras-chave</Label>
              <Input id="category-keywords" placeholder="mercado, casa, salário" {...form.register("keywords")} />
            </div>
          </div>
          <div className="muted-panel flex flex-wrap items-center gap-3">
            <PresetChip
              active
              background={findPreset(categoryColorPresets, selectedColor)?.background ?? "rgba(107,114,128,0.14)"}
              color={findPreset(categoryColorPresets, selectedColor)?.color ?? selectedColor}
              label={selectedType === "income" ? "Categoria de receita" : "Categoria de despesa"}
              shortLabel=""
              swatchOnly
            />
            <p className="text-sm text-[var(--color-muted-foreground)]">
              A cor será usada na interface e nos gráficos.
            </p>
          </div>
          <p className="text-sm text-[var(--color-muted-foreground)]">Use palavras-chave para ajudar a classificação automática.</p>
          <Button className="w-full" disabled={saveMutation.isPending} type="submit">
            {saveMutation.isPending ? "Salvando..." : isEditing ? "Salvar categoria" : "Criar categoria"}
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
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Categorias ativas</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Revise, edite ou restaure a base padrão sem duplicar itens existentes.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <Button
              disabled={restoreDefaultsMutation.isPending}
              onClick={() => restoreDefaultsMutation.mutate()}
              type="button"
              variant="secondary"
            >
              {restoreDefaultsMutation.isPending ? "Restaurando..." : "Restaurar categorias padrão"}
            </Button>
            <div className="grid gap-3 sm:grid-cols-2">
            <article className="metric-card">
              <p className="metric-label">Despesas</p>
              <p className="metric-value">{expenseCategories}</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Receitas</p>
              <p className="metric-value">{incomeCategories}</p>
            </article>
            </div>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {categories.map((category) => (
            <article key={category.id} className="data-card p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex rounded-full">
                  <PresetChip
                    compact
                    active
                    background={findPreset(categoryColorPresets, category.color)?.background ?? "rgba(107,114,128,0.14)"}
                    color={findPreset(categoryColorPresets, category.color)?.color ?? category.color}
                    label={category.name}
                    shortLabel=""
                    swatchOnly
                  />
                </span>
                <div className="min-w-0">
                  <p className="break-words text-base font-semibold text-[var(--color-foreground)]">{category.name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)]">
                      {category.type === "income" ? "Receita" : "Despesa"}
                    </span>
                    <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)]">
                      {category.isDefault ? "Padrão" : "Personalizada"}
                    </span>
                  </div>
                </div>
              </div>
              {category.keywords.length > 0 ? (
                <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">
                  {category.keywords.slice(0, 5).join(", ")}
                  {category.keywords.length > 5 ? "..." : ""}
                </p>
              ) : null}
              {category.monthlyLimit ? (
                <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                  Limite mensal: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(category.monthlyLimit)}
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => startEditing(category)} type="button" variant="secondary">
                  Editar
                </Button>
                <Button
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(category.id)}
                  type="button"
                  variant="ghost"
                >
                  Excluir
                </Button>
              </div>
            </article>
          ))}
          {!categoriesQuery.isLoading && categories.length === 0 ? (
            <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)] md:col-span-2">
              Nenhuma categoria foi cadastrada ainda. Crie categorias para melhorar o agrupamento dos lançamentos e a
              leitura dos relatórios.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
