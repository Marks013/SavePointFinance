"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
<<<<<<< HEAD
import { useForm, useWatch } from "react-hook-form";
=======
import { useForm } from "react-hook-form";
>>>>>>> 0dedb8a7d2d2c175ec23cd8d26bbf112193bdd5a
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PresetChip } from "@/components/ui/preset-chip";
import { Select } from "@/components/ui/select";
import { categoryFormSchema, type CategoryFormValues } from "@/features/categories/schemas/category-schema";
import { categoryColorPresets, findPreset } from "@/lib/finance/presets";
import { ensureApiResponse } from "@/lib/observability/http";

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
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar categorias", method: "GET", path: "/api/categories" });
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

  await ensureApiResponse(response, { fallbackMessage: "Falha ao criar categoria", method: "POST", path: "/api/categories" });
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

  await ensureApiResponse(response, { fallbackMessage: "Falha ao atualizar categoria", method: "PATCH", path: `/api/categories/${id}` });
  return response.json();
}

async function deleteCategory(id: string) {
  const response = await fetch(`/api/categories/${id}`, {
    method: "DELETE"
  });

  await ensureApiResponse(response, { fallbackMessage: "Falha ao excluir categoria", method: "DELETE", path: `/api/categories/${id}` });
}

async function restoreDefaultCategories() {
  const response = await fetch("/api/categories/defaults", {
    method: "POST"
  });
  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao restaurar categorias padrao",
    method: "POST",
    path: "/api/categories/defaults"
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
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const formSectionRef = useRef<HTMLElement | null>(null);
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const categories = categoriesQuery.data?.items ?? [];
  const expenseCategories = categories.filter((category) => category.type === "expense").length;
  const incomeCategories = categories.filter((category) => category.type === "income").length;
  const form = useForm<z.input<typeof categoryFormSchema>, unknown, CategoryFormValues>({
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
      const wasEditing = Boolean(editingId);
      toast.success(editingId ? "Categoria atualizada" : "Categoria criada");
      setEditingId(null);
      if (wasEditing) {
        setIsEditorOpen(false);
      }
      form.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] })
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
        setIsEditorOpen(false);
        form.reset();
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["categories"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] })
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
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] })
      ]);
    },
    onError: (error) => {
      toast.error("Não foi possível restaurar as categorias padrão", {
        description: error.message
      });
    }
  });

  const startEditing = (category: CategoryItem) => {
    setIsEditorOpen(true);
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
    setIsEditorOpen(false);
    form.reset();
  };

  const openCreateForm = () => {
    setEditingId(null);
    setIsEditorOpen(true);
    form.reset();
  };

  const isEditing = editingId !== null;
  const showEditor = isEditorOpen || isEditing || categories.length === 0;
<<<<<<< HEAD
  const selectedColor = useWatch({ control: form.control, name: "color" }) ?? categoryColorPresets[0].value;
  const selectedType = useWatch({ control: form.control, name: "type" }) ?? "expense";
  const scrollEditorIntoView = () => {
    const timeout = window.setTimeout(() => {
      const target = document.getElementById("category-name");
      const scrollTarget = target ?? formSectionRef.current;

      scrollTarget?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    }, 80);

    return () => window.clearTimeout(timeout);
  };
=======
  const selectedColor = form.watch("color") ?? categoryColorPresets[0].value;
  const selectedType = form.watch("type") ?? "expense";
>>>>>>> 0dedb8a7d2d2c175ec23cd8d26bbf112193bdd5a

  useEffect(() => {
    if (!editingId) {
      return;
    }

<<<<<<< HEAD
    return scrollEditorIntoView();
=======
    const timeout = window.setTimeout(() => {
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("category-name")?.focus();
    }, 80);

    return () => window.clearTimeout(timeout);
>>>>>>> 0dedb8a7d2d2c175ec23cd8d26bbf112193bdd5a
  }, [editingId]);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="surface content-section" ref={formSectionRef}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Categorias</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              {isEditing ? "Editar categoria" : "Nova categoria"}
            </h1>
          </div>
          {!showEditor ? (
            <Button onClick={openCreateForm} type="button" variant="secondary">
              Nova categoria
            </Button>
          ) : null}
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Cadastre categorias claras para organizar lançamentos e melhorar os relatórios.
        </p>

        {showEditor ? (
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
        ) : (
          <div className="muted-panel mt-8 flex flex-col gap-4 px-4 py-5 text-sm text-[var(--color-muted-foreground)]">
            <p>O editor foi fechado após a última edição concluída.</p>
            <Button className="w-full sm:w-auto" onClick={openCreateForm} type="button" variant="secondary">
              Nova categoria
            </Button>
          </div>
        )}
      </section>

      <section className="surface content-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Categorias ativas</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Revise, edite ou restaure a base padrão sem duplicar itens existentes.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
            <Button
              className="w-full sm:w-auto"
              disabled={restoreDefaultsMutation.isPending}
              onClick={() => restoreDefaultsMutation.mutate()}
              type="button"
              variant="secondary"
            >
              {restoreDefaultsMutation.isPending ? "Restaurando..." : "Restaurar categorias padrão"}
            </Button>
            <div className="grid w-full gap-3 sm:grid-cols-2">
              <article className="metric-card w-full">
                <p className="metric-label">Despesas</p>
                <p className="metric-value">{expenseCategories}</p>
              </article>
              <article className="metric-card w-full">
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
                <p className="mt-3 break-words text-sm text-[var(--color-muted-foreground)]">
                  {category.keywords.slice(0, 5).join(", ")}
                  {category.keywords.length > 5 ? "..." : ""}
                </p>
              ) : null}
              {category.monthlyLimit ? (
                <p className="mt-2 break-words text-sm text-[var(--color-muted-foreground)]">
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
