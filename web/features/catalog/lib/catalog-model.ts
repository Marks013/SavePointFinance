export type ProductStatus = "active" | "draft" | "archived";

export type ProductOptionValue = {
  id: string;
  label: string;
  swatch?: string;
};

export type ProductOption = {
  id: string;
  name: string;
  linkedMetafieldId?: string;
  values: ProductOptionValue[];
};

export type CategoryMetafieldDefinition = {
  id: string;
  label: string;
  type: "single_line_text" | "list" | "color" | "taxonomy_reference";
  values: string[];
  variantOptionName?: string;
};

export type ProductCollection = {
  id: string;
  title: string;
  mode: "manual" | "smart";
  rule?: {
    field: "tag" | "metafield" | "vendor" | "status";
    operator: "equals" | "contains";
    value: string;
  };
};

export type ProductVariant = {
  id: string;
  title: string;
  optionValues: Record<string, string>;
  sku: string;
  price: number;
  compareAtPrice?: number;
  inventory: number;
  imageUrl?: string;
  status: ProductStatus;
};

export type CatalogProduct = {
  id: string;
  title: string;
  slug: string;
  vendor: string;
  productType: string;
  category: string;
  status: ProductStatus;
  description: string;
  shortDescription: string;
  price: number;
  compareAtPrice?: number;
  baseSku: string;
  media: string[];
  options: ProductOption[];
  variants: ProductVariant[];
  collections: string[];
  tags: string[];
  categoryMetafields: CategoryMetafieldDefinition[];
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  currency: "BRL",
  style: "currency"
});

export function formatCatalogCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function slugifyProductTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function optionSignature(optionValues: Record<string, string>) {
  return Object.entries(optionValues)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}`)
    .join("|");
}

function combineOptions(options: ProductOption[]) {
  return options.reduce<Record<string, string>[]>((combinations, option) => {
    if (option.values.length === 0) {
      return combinations;
    }

    return combinations.flatMap((combination) =>
      option.values.map((value) => ({
        ...combination,
        [option.name]: value.label
      }))
    );
  }, [{}]);
}

export function buildVariantMatrix(product: CatalogProduct) {
  const existingBySignature = new Map(product.variants.map((variant) => [optionSignature(variant.optionValues), variant]));
  const colorOption = product.options.find((option) => option.name.toLowerCase() === "cor");
  const combinations = combineOptions(product.options);

  return combinations.map((optionValues, index) => {
    const signature = optionSignature(optionValues);
    const existing = existingBySignature.get(signature);
    const title = Object.values(optionValues).join(" / ");
    const color = optionValues.Cor;
    const colorIndex = colorOption?.values.findIndex((value) => value.label === color) ?? -1;

    return {
      id: existing?.id ?? `variant-${index + 1}`,
      title,
      optionValues,
      sku:
        existing?.sku ??
        `${product.baseSku}-${Object.values(optionValues)
          .map((value) => slugifyProductTitle(value).toUpperCase())
          .join("-")}`,
      price: existing?.price ?? product.price,
      compareAtPrice: existing?.compareAtPrice ?? product.compareAtPrice,
      inventory: existing?.inventory ?? 0,
      imageUrl: existing?.imageUrl ?? product.media[Math.max(0, colorIndex)] ?? product.media[0],
      status: existing?.status ?? product.status
    } satisfies ProductVariant;
  });
}

export function groupVariantsByOption(variants: ProductVariant[], optionName: string) {
  return variants.reduce<Record<string, ProductVariant[]>>((groups, variant) => {
    const key = variant.optionValues[optionName] ?? "Sem opcao";
    groups[key] = [...(groups[key] ?? []), variant];
    return groups;
  }, {});
}

export function deriveProductTags(product: CatalogProduct) {
  const tags = new Set(product.tags);

  product.options.forEach((option) => {
    option.values.forEach((value) => tags.add(`${option.name}_${value.label}`.replace(/\s+/g, "")));
  });

  product.categoryMetafields.forEach((metafield) => {
    metafield.values.forEach((value) => tags.add(`${metafield.label}_${value}`.replace(/\s+/g, "")));
  });

  return [...tags];
}

export function resolveSmartCollections(product: CatalogProduct, collections: ProductCollection[]) {
  const tags = deriveProductTags(product);

  return collections.filter((collection) => {
    if (collection.mode === "manual") {
      return product.collections.includes(collection.id);
    }

    const rule = collection.rule;
    if (!rule) {
      return false;
    }

    const haystack =
      rule.field === "tag"
        ? tags
        : rule.field === "vendor"
          ? [product.vendor]
          : rule.field === "status"
            ? [product.status]
            : product.categoryMetafields.flatMap((metafield) => metafield.values);

    return haystack.some((value) => (rule.operator === "equals" ? value === rule.value : value.includes(rule.value)));
  });
}

export const sampleCollections: ProductCollection[] = [
  { id: "catalogo", title: "Catalogo", mode: "manual" },
  { id: "camisetas", title: "Camisetas", mode: "smart", rule: { field: "metafield", operator: "contains", value: "Algodao" } },
  { id: "lancamentos", title: "Novidades", mode: "manual" },
  { id: "mais-vendidos", title: "Mais vendidos", mode: "smart", rule: { field: "tag", operator: "contains", value: "MaisVendidos" } }
];

export const sampleProduct: CatalogProduct = {
  id: "prod-nerd-001",
  title: "Camiseta Unissex Gato",
  slug: "camiseta-unissex-gato",
  vendor: "Nerdlingolab",
  productType: "Camiseta Basica Algodao",
  category: "Camisetas em blusas e regatas",
  status: "active",
  shortDescription: "Arte japonesa e o charme dos felinos em uma camiseta unissex exclusiva.",
  description:
    "Arte japonesa e o charme dos felinos se encontram nesta camiseta unissex exclusiva. A estampa traz um gato em uma paisagem estilo ukiyo-e, combinando tradicao niponica com moda contemporanea fashion.",
  price: 66.9,
  baseSku: "SHOPIFY-J1Z284-CAMISETA-UNISSEX-GATO",
  media: [
    "/api/media/imported/2026/04/28/5b9e6724-2a56-437c-89df-38dd904e9876.webp",
    "/api/media/imported/2026/04/28/875c2896-7048-48b8-9571-af314c4f51c6.webp",
    "/api/media/imported/2026/04/28/00de5cd4-4480-41cc-906d-919a6a9771b8.webp",
    "/api/media/imported/2026/04/28/be02a727-de0f-4f93-ada1-0a7b2b78e23d.webp"
  ],
  options: [
    {
      id: "color",
      name: "Cor",
      linkedMetafieldId: "cor",
      values: [
        { id: "preto", label: "Preto", swatch: "#050505" },
        { id: "azul", label: "Azul", swatch: "#1f78d1" },
        { id: "bege", label: "Bege", swatch: "#dcc798" },
        { id: "vermelho", label: "Vermelho", swatch: "#ef3333" },
        { id: "cinza", label: "Cinza", swatch: "#8a8d8f" },
        { id: "creme", label: "Creme", swatch: "#f5edc7" }
      ]
    },
    {
      id: "size",
      name: "Tamanho",
      linkedMetafieldId: "tamanho",
      values: [
        { id: "p", label: "P" },
        { id: "m", label: "M" },
        { id: "g", label: "G" },
        { id: "gg", label: "GG" }
      ]
    }
  ],
  variants: [],
  collections: ["catalogo", "lancamentos"],
  tags: ["Genero_Masculino", "MaisVendidos"],
  categoryMetafields: [
    { id: "cor", label: "Cor", type: "color", variantOptionName: "Cor", values: ["Preto", "Azul", "Bege", "Vermelho", "Cinza", "Creme"] },
    { id: "tamanho", label: "Tamanho", type: "list", variantOptionName: "Tamanho", values: ["P", "M", "G", "GG"] },
    { id: "tecido", label: "Tecido", type: "list", values: ["Algodao", "Poliester"] },
    { id: "idade", label: "Grupo de idade", type: "list", values: ["Adultos", "Adolescentes"] },
    { id: "cuidados", label: "Instrucoes de cuidados", type: "single_line_text", values: ["Lavar do avesso em agua fria"] },
    { id: "caracteristicas", label: "Caracteristicas de roupas", type: "list", values: ["Absorcao de umidade", "Secagem rapida"] },
    { id: "decote", label: "Decote", type: "list", values: ["Redondo"] },
    { id: "genero", label: "Genero alvo", type: "list", values: ["Feminino", "Unissex"] },
    { id: "comprimento-top", label: "Tipo de comprimento do top", type: "list", values: ["Medio"] }
  ]
};

sampleProduct.variants = buildVariantMatrix(sampleProduct);
