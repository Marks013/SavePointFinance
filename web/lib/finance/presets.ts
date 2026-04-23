export type PresetOption = {
  value: string;
  label: string;
  shortLabel: string;
  color: string;
  background: string;
  description?: string;
};

export type SubscriptionServicePreset = {
  value: string;
  label: string;
  monogram: string;
  color: string;
  background: string;
  accent: string;
  description: string;
  categoryName: string;
  type: "income" | "expense";
};

export const accountColorPresets: PresetOption[] = [
  {
    value: "#0F8A5F",
    label: "Esmeralda",
    shortLabel: "ES",
    color: "#0F8A5F",
    background: "rgba(15,138,95,0.14)"
  },
  {
    value: "#1D4ED8",
    label: "Azul safira",
    shortLabel: "AZ",
    color: "#1D4ED8",
    background: "rgba(29,78,216,0.14)"
  },
  {
    value: "#B45309",
    label: "\u00c2mbar",
    shortLabel: "AM",
    color: "#B45309",
    background: "rgba(180,83,9,0.14)"
  },
  {
    value: "#7C3AED",
    label: "Violeta",
    shortLabel: "VI",
    color: "#7C3AED",
    background: "rgba(124,58,237,0.14)"
  },
  {
    value: "#0F766E",
    label: "Turquesa",
    shortLabel: "TU",
    color: "#0F766E",
    background: "rgba(15,118,110,0.14)"
  },
  {
    value: "#111111",
    label: "Preto ônix",
    shortLabel: "PO",
    color: "#111111",
    background: "rgba(17,17,17,0.16)"
  }
];

export const cardColorPresets: PresetOption[] = [
  {
    value: "#1F2937",
    label: "Grafite",
    shortLabel: "GF",
    color: "#1F2937",
    background: "rgba(31,41,55,0.14)"
  },
  {
    value: "#7C2D12",
    label: "Cobre",
    shortLabel: "CB",
    color: "#7C2D12",
    background: "rgba(124,45,18,0.14)"
  },
  {
    value: "#0F766E",
    label: "Verde profundo",
    shortLabel: "VD",
    color: "#0F766E",
    background: "rgba(15,118,110,0.14)"
  },
  {
    value: "#1D4ED8",
    label: "Azul clássico",
    shortLabel: "AC",
    color: "#1D4ED8",
    background: "rgba(29,78,216,0.14)"
  },
  {
    value: "#7F1D1D",
    label: "Bordô",
    shortLabel: "BD",
    color: "#7F1D1D",
    background: "rgba(127,29,29,0.14)"
  },
  {
    value: "#111111",
    label: "Preto absoluto",
    shortLabel: "PA",
    color: "#111111",
    background: "rgba(17,17,17,0.18)"
  }
];

export const brazilianInstitutions: PresetOption[] = [
  {
    value: "Nubank",
    label: "Nubank",
    shortLabel: "NU",
    color: "#7A1CAC",
    background: "rgba(122,28,172,0.14)",
    description: "Banco digital"
  },
  {
    value: "Itaú",
    label: "Itaú",
    shortLabel: "IT",
    color: "#D97706",
    background: "rgba(217,119,6,0.14)",
    description: "Banco tradicional"
  },
  {
    value: "Bradesco",
    label: "Bradesco",
    shortLabel: "BR",
    color: "#BE123C",
    background: "rgba(190,18,60,0.14)",
    description: "Banco tradicional"
  },
  {
    value: "Banco do Brasil",
    label: "Banco do Brasil",
    shortLabel: "BB",
    color: "#1D4ED8",
    background: "rgba(29,78,216,0.14)",
    description: "Banco tradicional"
  },
  {
    value: "Caixa",
    label: "Caixa",
    shortLabel: "CX",
    color: "#0F766E",
    background: "rgba(15,118,110,0.14)",
    description: "Banco público"
  },
  {
    value: "Santander",
    label: "Santander",
    shortLabel: "ST",
    color: "#DC2626",
    background: "rgba(220,38,38,0.14)",
    description: "Banco tradicional"
  },
  {
    value: "Inter",
    label: "Inter",
    shortLabel: "IN",
    color: "#EA580C",
    background: "rgba(234,88,12,0.14)",
    description: "Banco digital"
  },
  {
    value: "C6 Bank",
    label: "C6 Bank",
    shortLabel: "C6",
    color: "#111827",
    background: "rgba(17,24,39,0.14)",
    description: "Banco digital"
  },
  {
    value: "Mercado Pago",
    label: "Mercado Pago",
    shortLabel: "MP",
    color: "#0284C7",
    background: "rgba(2,132,199,0.14)",
    description: "Conta digital"
  },
  {
    value: "PicPay",
    label: "PicPay",
    shortLabel: "PP",
    color: "#16A34A",
    background: "rgba(22,163,74,0.14)",
    description: "Carteira digital"
  },
  {
    value: "Sicredi",
    label: "Sicredi",
    shortLabel: "SI",
    color: "#15803D",
    background: "rgba(21,128,61,0.14)",
    description: "Cooperativa de crédito"
  },
  {
    value: "Sicoob",
    label: "Sicoob",
    shortLabel: "SC",
    color: "#0F766E",
    background: "rgba(15,118,110,0.14)",
    description: "Cooperativa de crédito"
  },
  {
    value: "BTG Pactual",
    label: "BTG Pactual",
    shortLabel: "BT",
    color: "#1E3A8A",
    background: "rgba(30,58,138,0.14)",
    description: "Banco de investimentos"
  },
  {
    value: "XP",
    label: "XP",
    shortLabel: "XP",
    color: "#111827",
    background: "rgba(17,24,39,0.14)",
    description: "Plataforma de investimentos"
  },
  {
    value: "PagBank",
    label: "PagBank",
    shortLabel: "PB",
    color: "#16A34A",
    background: "rgba(22,163,74,0.14)",
    description: "Conta digital"
  },
  {
    value: "Banco PAN",
    label: "Banco PAN",
    shortLabel: "PN",
    color: "#2563EB",
    background: "rgba(37,99,235,0.14)",
    description: "Banco digital"
  },
  {
    value: "Neon",
    label: "Neon",
    shortLabel: "NE",
    color: "#06B6D4",
    background: "rgba(6,182,212,0.14)",
    description: "Banco digital"
  },
  {
    value: "Banco Original",
    label: "Banco Original",
    shortLabel: "OR",
    color: "#16A34A",
    background: "rgba(22,163,74,0.14)",
    description: "Banco digital"
  },
  {
    value: "Safra",
    label: "Safra",
    shortLabel: "SF",
    color: "#0F766E",
    background: "rgba(15,118,110,0.14)",
    description: "Banco tradicional"
  },
  {
    value: "Banrisul",
    label: "Banrisul",
    shortLabel: "BS",
    color: "#BE123C",
    background: "rgba(190,18,60,0.14)",
    description: "Banco regional"
  },
  {
    value: "BRB",
    label: "BRB",
    shortLabel: "RB",
    color: "#1D4ED8",
    background: "rgba(29,78,216,0.14)",
    description: "Banco regional"
  },
  {
    value: "Banco Intermedium",
    label: "Banco Intermedium",
    shortLabel: "IM",
    color: "#EA580C",
    background: "rgba(234,88,12,0.14)",
    description: "Instituição legada"
  },
  {
    value: "Stone",
    label: "Stone",
    shortLabel: "ST",
    color: "#16A34A",
    background: "rgba(22,163,74,0.14)",
    description: "Conta empresarial"
  },
  {
    value: "Cielo",
    label: "Cielo",
    shortLabel: "CL",
    color: "#2563EB",
    background: "rgba(37,99,235,0.14)",
    description: "Conta e adquirência"
  },
  {
    value: "RecargaPay",
    label: "RecargaPay",
    shortLabel: "RP",
    color: "#7C3AED",
    background: "rgba(124,58,237,0.14)",
    description: "Carteira digital"
  },
  {
    value: "Will Bank",
    label: "Will Bank",
    shortLabel: "WB",
    color: "#F97316",
    background: "rgba(249,115,22,0.14)",
    description: "Banco digital"
  },
  {
    value: "99Pay",
    label: "99Pay",
    shortLabel: "99",
    color: "#EAB308",
    background: "rgba(234,179,8,0.14)",
    description: "Carteira digital"
  },
  {
    value: "Banco BMG",
    label: "Banco BMG",
    shortLabel: "BM",
    color: "#C2410C",
    background: "rgba(194,65,12,0.14)",
    description: "Banco tradicional"
  },
  {
    value: "Outro",
    label: "Outro",
    shortLabel: "OU",
    color: "#6B7280",
    background: "rgba(107,114,128,0.14)",
    description: "Outra instituição"
  }
];

export const cardBrandPresets: PresetOption[] = [
  {
    value: "Visa",
    label: "Visa",
    shortLabel: "VI",
    color: "#1D4ED8",
    background: "rgba(29,78,216,0.14)"
  },
  {
    value: "Mastercard",
    label: "Mastercard",
    shortLabel: "MC",
    color: "#DC2626",
    background: "rgba(220,38,38,0.14)"
  },
  {
    value: "Elo",
    label: "Elo",
    shortLabel: "EL",
    color: "#7C3AED",
    background: "rgba(124,58,237,0.14)"
  },
  {
    value: "American Express",
    label: "American Express",
    shortLabel: "AE",
    color: "#0F766E",
    background: "rgba(15,118,110,0.14)"
  },
  {
    value: "Hipercard",
    label: "Hipercard",
    shortLabel: "HP",
    color: "#F97316",
    background: "rgba(249,115,22,0.14)"
  },
  {
    value: "Cabal",
    label: "Cabal",
    shortLabel: "CB",
    color: "#2563EB",
    background: "rgba(37,99,235,0.14)"
  },
  {
    value: "Hiper",
    label: "Hiper",
    shortLabel: "HI",
    color: "#BE123C",
    background: "rgba(190,18,60,0.14)"
  }
];

export const categoryColorPresets: PresetOption[] = [
  {
    value: "#0F8A5F",
    label: "Verde",
    shortLabel: "V",
    color: "#0F8A5F",
    background: "rgba(15,138,95,0.14)"
  },
  {
    value: "#1D4ED8",
    label: "Azul",
    shortLabel: "A",
    color: "#1D4ED8",
    background: "rgba(29,78,216,0.14)"
  },
  {
    value: "#B45309",
    label: "\u00c2mbar",
    shortLabel: "A",
    color: "#B45309",
    background: "rgba(180,83,9,0.14)"
  },
  {
    value: "#BE123C",
    label: "Rubi",
    shortLabel: "R",
    color: "#BE123C",
    background: "rgba(190,18,60,0.14)"
  },
  {
    value: "#7C3AED",
    label: "Violeta",
    shortLabel: "V",
    color: "#7C3AED",
    background: "rgba(124,58,237,0.14)"
  },
  {
    value: "#0F766E",
    label: "Turquesa",
    shortLabel: "T",
    color: "#0F766E",
    background: "rgba(15,118,110,0.14)"
  },
  {
    value: "#6B7280",
    label: "Cinza",
    shortLabel: "C",
    color: "#6B7280",
    background: "rgba(107,114,128,0.14)"
  },
  {
    value: "#111111",
    label: "Preto",
    shortLabel: "P",
    color: "#111111",
    background: "rgba(17,17,17,0.16)"
  }
];

export const subscriptionServicePresets: SubscriptionServicePreset[] = [
  {
    value: "netflix",
    label: "Netflix",
    monogram: "N",
    color: "#E50914",
    background: "rgba(229,9,20,0.14)",
    accent: "#FF5C63",
    description: "Séries e filmes",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "prime-video",
    label: "Prime Video",
    monogram: "PV",
    color: "#0F79AF",
    background: "rgba(15,121,175,0.16)",
    accent: "#56C1FF",
    description: "Vídeo e benefícios Prime",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "disney-plus",
    label: "Disney+",
    monogram: "D+",
    color: "#113CCF",
    background: "rgba(17,60,207,0.16)",
    accent: "#72A8FF",
    description: "Disney, Pixar, Marvel e Star",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "max",
    label: "Max",
    monogram: "M",
    color: "#5B2EFF",
    background: "rgba(91,46,255,0.16)",
    accent: "#9E83FF",
    description: "Séries, filmes e HBO",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "globoplay",
    label: "Globoplay",
    monogram: "G",
    color: "#EA4335",
    background: "rgba(234,67,53,0.14)",
    accent: "#FF8B80",
    description: "Streaming brasileiro",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "youtube-premium",
    label: "YouTube Premium",
    monogram: "YT",
    color: "#FF0033",
    background: "rgba(255,0,51,0.14)",
    accent: "#FF6B8D",
    description: "Vídeo sem anúncios",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "spotify",
    label: "Spotify",
    monogram: "S",
    color: "#1DB954",
    background: "rgba(29,185,84,0.16)",
    accent: "#76F2A2",
    description: "Música e podcasts",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "deezer",
    label: "Deezer",
    monogram: "DZ",
    color: "#7A3AF9",
    background: "rgba(122,58,249,0.16)",
    accent: "#B59BFF",
    description: "Streaming musical",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "crunchyroll",
    label: "Crunchyroll",
    monogram: "CR",
    color: "#F47521",
    background: "rgba(244,117,33,0.16)",
    accent: "#FFB072",
    description: "Animes e simulcasts",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "apple-tv",
    label: "Apple TV+",
    monogram: "TV",
    color: "#111111",
    background: "rgba(17,17,17,0.16)",
    accent: "#A1A1AA",
    description: "Streaming premium",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "paramount-plus",
    label: "Paramount+",
    monogram: "P+",
    color: "#0057FF",
    background: "rgba(0,87,255,0.14)",
    accent: "#7DAEFF",
    description: "Filmes, séries e esportes",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "telecine",
    label: "Telecine",
    monogram: "TC",
    color: "#E10098",
    background: "rgba(225,0,152,0.14)",
    accent: "#FF77CC",
    description: "Filmes em destaque",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  },
  {
    value: "premiere",
    label: "Premiere",
    monogram: "PR",
    color: "#1F8E3D",
    background: "rgba(31,142,61,0.14)",
    accent: "#73D98F",
    description: "Futebol ao vivo",
    categoryName: "Streaming e assinaturas",
    type: "expense"
  }
];

export function findPreset(options: PresetOption[], value: string | null | undefined) {
  return options.find((option) => option.value === value) ?? null;
}

function normalizePresetValue(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

export function findSubscriptionServicePreset(value: string | null | undefined) {
  const normalizedValue = normalizePresetValue(value);
  return (
    subscriptionServicePresets.find(
      (preset) =>
        normalizePresetValue(preset.value) === normalizedValue || normalizePresetValue(preset.label) === normalizedValue
    ) ?? null
  );
}
