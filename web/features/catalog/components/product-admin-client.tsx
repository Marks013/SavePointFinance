"use client";

/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import {
  Archive,
  Boxes,
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
  GripVertical,
  ImagePlus,
  Link2,
  ListFilter,
  PackageCheck,
  Plus,
  Save,
  Search,
  Settings2,
  Sparkles,
  Tags,
  Trash2
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  buildVariantMatrix,
  deriveProductTags,
  formatCatalogCurrency,
  groupVariantsByOption,
  resolveSmartCollections,
  sampleCollections,
  sampleProduct,
  slugifyProductTitle,
  type CatalogProduct,
  type ProductOption
} from "@/features/catalog/lib/catalog-model";
import { cn } from "@/lib/utils";

const panelClass =
  "rounded-[1.25rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_86%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.08)]";
const labelClass = "text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]";
const inputClass =
  "min-h-11 rounded-xl border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-input)_82%,transparent)] text-sm";

function Chip({
  children,
  swatch,
  active = false,
  onRemove
}: {
  children: string;
  swatch?: string;
  active?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold",
        active
          ? "border-[color-mix(in_srgb,var(--color-primary)_42%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)]"
          : "border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_70%,transparent)]"
      )}
    >
      {swatch ? <span className="h-3.5 w-3.5 rounded-[0.25rem] border border-black/10" style={{ background: swatch }} /> : null}
      <span className="truncate">{children}</span>
      {onRemove ? (
        <button aria-label={`Remover ${children}`} className="rounded p-0.5 hover:bg-black/10" type="button" onClick={onRemove}>
          <Trash2 className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}

function Field({
  label,
  children,
  className
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-2", className)}>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function ProductAdminClient() {
  const [product, setProduct] = useState<CatalogProduct>(sampleProduct);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState("Cor");

  const variants = useMemo(() => buildVariantMatrix(product), [product]);
  const groupedVariants = useMemo(() => groupVariantsByOption(variants, groupBy), [variants, groupBy]);
  const derivedTags = useMemo(() => deriveProductTags({ ...product, variants }), [product, variants]);
  const activeCollections = useMemo(() => resolveSmartCollections({ ...product, variants }, sampleCollections), [product, variants]);
  const totalStock = variants.reduce((total, variant) => total + variant.inventory, 0);

  function updateProduct(patch: Partial<CatalogProduct>) {
    setProduct((current) => {
      const next = { ...current, ...patch };
      return { ...next, variants: buildVariantMatrix(next) };
    });
  }

  function updateOption(optionId: string, nextOption: ProductOption) {
    setProduct((current) => {
      const next = {
        ...current,
        options: current.options.map((option) => (option.id === optionId ? nextOption : option))
      };
      return { ...next, variants: buildVariantMatrix(next) };
    });
  }

  function saveProduct() {
    setProduct((current) => ({ ...current, variants: buildVariantMatrix(current), tags: derivedTags }));
    setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
  }

  return (
    <main className="page-shell space-y-5 py-5">
      <section className="rounded-[1.5rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_90%,transparent)] p-4 shadow-[0_24px_70px_rgba(0,0,0,0.14)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
              <PackageCheck className="h-4 w-4 text-[var(--color-primary)]" />
              Admin / Produtos
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--color-foreground)] sm:text-3xl">Editor de produto</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--color-muted-foreground)]">
              Produto, opcoes, variantes, colecoes e metacampos em um fluxo unico inspirado no modelo operacional da Shopify.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary">
              <Archive className="h-4 w-4" />
              Arquivar
            </Button>
            <Button type="button" variant="secondary">
              <Copy className="h-4 w-4" />
              Duplicar
            </Button>
            <Button type="button" onClick={saveProduct}>
              <Save className="h-4 w-4" />
              Salvar produto
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Variantes", variants.length.toString(), Boxes],
            ["Estoque total", totalStock.toString(), PackageCheck],
            ["Colecoes", activeCollections.length.toString(), Tags],
            ["Status", product.status === "active" ? "Ativo" : "Rascunho", Check]
          ].map(([label, value, Icon]) => (
            <div key={label as string} className="rounded-2xl border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_42%,transparent)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">{label as string}</span>
                <Icon className="h-4 w-4 text-[var(--color-primary)]" />
              </div>
              <p className="mt-2 text-xl font-semibold">{value as string}</p>
            </div>
          ))}
        </div>
      </section>

      {savedAt ? (
        <div className="rounded-2xl border border-[color-mix(in_srgb,var(--color-primary)_36%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] px-4 py-3 text-sm font-semibold">
          Produto salvo localmente as {savedAt}. A estrutura ja esta pronta para ligar em API/Prisma quando o catalogo for persistido no banco.
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <section className={panelClass}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field className="md:col-span-2" label="Titulo">
                <Input className={inputClass} value={product.title} onChange={(event) => updateProduct({ title: event.target.value, slug: slugifyProductTitle(event.target.value) })} />
              </Field>
              <Field label="Slug">
                <Input className={inputClass} value={product.slug} onChange={(event) => updateProduct({ slug: event.target.value })} />
              </Field>
              <Field label="Situacao">
                <Select className={inputClass} value={product.status} onChange={(event) => updateProduct({ status: event.target.value as CatalogProduct["status"] })}>
                  <option value="active">Ativo</option>
                  <option value="draft">Rascunho</option>
                  <option value="archived">Arquivado</option>
                </Select>
              </Field>
              <Field label="Preco">
                <Input className={inputClass} value={product.price} type="number" step="0.01" onChange={(event) => updateProduct({ price: Number(event.target.value) || 0 })} />
              </Field>
              <Field label="Preco comparativo">
                <Input className={inputClass} value={product.compareAtPrice ?? ""} type="number" step="0.01" onChange={(event) => updateProduct({ compareAtPrice: Number(event.target.value) || undefined })} />
              </Field>
            </div>
          </section>

          <section className={panelClass}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Descricao</h2>
                <p className="text-sm text-[var(--color-muted-foreground)]">Editor visual compacto para texto comercial, detalhes e cuidados.</p>
              </div>
              <Button type="button" variant="secondary">
                <Sparkles className="h-4 w-4" />
                Melhorar texto
              </Button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
              <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_56%,transparent)] p-2">
                {["Paragrafo", "B", "I", "Lista", "Link", "Midia", "Tabela"].map((item) => (
                  <button key={item} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold hover:bg-[color-mix(in_srgb,var(--color-foreground)_8%,transparent)]" type="button">
                    {item}
                  </button>
                ))}
              </div>
              <textarea
                className="min-h-44 w-full resize-y bg-transparent p-4 text-sm leading-7 outline-none"
                value={product.description}
                onChange={(event) => updateProduct({ description: event.target.value })}
              />
            </div>
          </section>

          <section className={panelClass}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Midia</h2>
                <p className="text-sm text-[var(--color-muted-foreground)]">Imagens ficam disponiveis para produto e para cada variante.</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary">
                  <ImagePlus className="h-4 w-4" />
                  Enviar
                </Button>
                <Button type="button" variant="secondary">
                  <Search className="h-4 w-4" />
                  Biblioteca
                </Button>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              {product.media.map((item, index) => (
                <div key={item} className="aspect-square overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[linear-gradient(135deg,#1f2937,#d9c090)]">
                  <img alt={`Midia ${index + 1}`} className="h-full w-full object-cover" src={item} />
                </div>
              ))}
            </div>
          </section>

          <section className={panelClass}>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Variantes</h2>
                <p className="text-sm text-[var(--color-muted-foreground)]">Opcoes conectadas a metacampos geram automaticamente a matriz de variantes.</p>
              </div>
              <Button type="button" variant="secondary">
                <Plus className="h-4 w-4" />
                Adicionar variante
              </Button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
              {product.options.map((option) => (
                <div key={option.id} className="grid gap-3 border-b border-[var(--color-border)] p-4 md:grid-cols-[2rem_8rem_minmax(0,1fr)]">
                  <GripVertical className="mt-2 h-4 w-4 text-[var(--color-muted-foreground)]" />
                  <div>
                    <p className="font-semibold">{option.name}</p>
                    {option.linkedMetafieldId ? (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--color-primary)]">
                        <Link2 className="h-3 w-3" />
                        Metacampo
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {option.values.map((value) => (
                      <Chip
                        key={value.id}
                        swatch={value.swatch}
                        onRemove={() => updateOption(option.id, { ...option, values: option.values.filter((item) => item.id !== value.id) })}
                      >
                        {value.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
              <button
                className="flex w-full items-center gap-2 p-4 text-sm font-semibold hover:bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
                type="button"
                onClick={() => {
                  const nextValue = { id: `valor-${Date.now()}`, label: "Novo valor" };
                  const firstOption = product.options[0];
                  updateOption(firstOption.id, { ...firstOption, values: [...firstOption.values, nextValue] });
                }}
              >
                <Plus className="h-4 w-4" />
                Adicionar outro valor
              </button>
            </div>
          </section>

          <section className={panelClass}>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Matriz de variantes</h2>
                <p className="text-sm text-[var(--color-muted-foreground)]">Edite preco e disponibilidade por grupo, mantendo SKU e imagem por combinacao.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select className="h-10 min-h-10 rounded-xl" value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
                  {product.options.map((option) => (
                    <option key={option.id} value={option.name}>
                      Agrupar por {option.name}
                    </option>
                  ))}
                </Select>
                <Button type="button" variant="secondary">
                  <ListFilter className="h-4 w-4" />
                  Filtrar
                </Button>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
              <div className="grid grid-cols-[2.5rem_minmax(13rem,1fr)_9rem_8rem] gap-3 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_48%,transparent)] px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)]">
                <span />
                <span>Variante</span>
                <span>Preco</span>
                <span>Disponivel</span>
              </div>
              {Object.entries(groupedVariants).map(([group, groupItems]) => (
                <details key={group} open className="border-b border-[var(--color-border)] last:border-b-0">
                  <summary className="grid cursor-pointer grid-cols-[2.5rem_minmax(13rem,1fr)_9rem_8rem] items-center gap-3 px-3 py-3">
                    <input aria-label={`Selecionar ${group}`} className="app-checkbox h-4 w-4" type="checkbox" />
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-xl bg-[linear-gradient(135deg,#111827,#e8d7b6)]">
                        <img alt="" className="h-full w-full object-cover" src={groupItems[0]?.imageUrl} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{group}</p>
                        <p className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                          {groupItems.length} variantes <ChevronDown className="h-3 w-3" />
                        </p>
                      </div>
                    </div>
                    <Input className="h-10 rounded-xl" value={formatCatalogCurrency(groupItems[0]?.price ?? product.price)} readOnly />
                    <Input className="h-10 rounded-xl" value={groupItems.reduce((total, variant) => total + variant.inventory, 0)} readOnly />
                  </summary>
                  <div className="grid gap-2 bg-[color-mix(in_srgb,var(--color-muted)_24%,transparent)] p-3">
                    {groupItems.map((variant) => (
                      <div key={variant.id} className="grid gap-2 rounded-xl border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_88%,transparent)] p-3 md:grid-cols-[minmax(0,1fr)_9rem_8rem]">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{variant.title}</p>
                          <p className="truncate text-xs text-[var(--color-muted-foreground)]">{variant.sku}</p>
                        </div>
                        <Input className="h-10 rounded-xl" defaultValue={variant.price} type="number" />
                        <Input className="h-10 rounded-xl" defaultValue={variant.inventory} type="number" />
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </section>

          <section className={panelClass}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Metacampos de categoria</h2>
                <p className="text-sm text-[var(--color-muted-foreground)]">{product.category}</p>
              </div>
              <Settings2 className="h-5 w-5 text-[var(--color-primary)]" />
            </div>
            <div className="grid gap-3">
              {product.categoryMetafields.map((metafield) => (
                <div key={metafield.id} className="grid gap-2 md:grid-cols-[13rem_minmax(0,1fr)] md:items-center">
                  <span className="text-sm font-semibold">{metafield.label}</span>
                  <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-input)_64%,transparent)] px-2 py-2">
                    {metafield.values.map((value) => (
                      <Chip key={value} active={Boolean(metafield.variantOptionName)}>
                        {value}
                      </Chip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-5">
          <section className={panelClass}>
            <h2 className="text-lg font-semibold">Organizacao do produto</h2>
            <div className="mt-4 grid gap-4">
              <Field label="Tipo">
                <Input className={inputClass} value={product.productType} onChange={(event) => updateProduct({ productType: event.target.value })} />
              </Field>
              <Field label="Fabricante">
                <Input className={inputClass} value={product.vendor} onChange={(event) => updateProduct({ vendor: event.target.value })} />
              </Field>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className={labelClass}>Colecoes</span>
                  <Plus className="h-4 w-4 text-[var(--color-primary)]" />
                </div>
                <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-input)_64%,transparent)] p-2">
                  {activeCollections.map((collection) => (
                    <Chip key={collection.id} active={collection.mode === "smart"}>
                      {collection.title}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="grid gap-2">
                <span className={labelClass}>Tags</span>
                <div className="flex max-h-44 flex-wrap gap-2 overflow-auto rounded-xl border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-input)_64%,transparent)] p-2 subtle-scrollbar">
                  {derivedTags.map((tag) => (
                    <Chip key={tag}>{tag}</Chip>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className={panelClass}>
            <div className="flex items-center gap-2">
              <CircleDollarSign className="h-5 w-5 text-[var(--color-primary)]" />
              <h2 className="text-lg font-semibold">Precificacao</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-[var(--color-muted-foreground)]">Preco base</span>
                <strong>{formatCatalogCurrency(product.price)}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[var(--color-muted-foreground)]">Menor variante</span>
                <strong>{formatCatalogCurrency(Math.min(...variants.map((variant) => variant.price)))}</strong>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-[var(--color-muted-foreground)]">SKU base</span>
                <strong className="max-w-[12rem] truncate text-right">{product.baseSku}</strong>
              </div>
            </div>
          </section>

          <section className={panelClass}>
            <h2 className="text-lg font-semibold">Arquitetura aplicada</h2>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
              <li>Opcoes de produto geram uma matriz de variantes por combinacao.</li>
              <li>Metacampos de categoria alimentam opcoes, tags e descoberta.</li>
              <li>Colecoes manuais e inteligentes resolvem a organizacao do catalogo.</li>
              <li>Midias podem ser herdadas pelo produto ou fixadas por variante.</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
