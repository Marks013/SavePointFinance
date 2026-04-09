const BANK_STATEMENT_NOISE_PATTERNS = [
  /\bcompra(?:\s+cartao)?\b/g,
  /\bpagamento\b/g,
  /\bpgto\b/g,
  /\bpix\b/g,
  /\btransf(?:erencia)?\b/g,
  /\bcredito\b/g,
  /\bdebito\b/g,
  /\bboleto\b/g,
  /\bdoc\b/g,
  /\bted\b/g,
  /\bparc(?:ela)?\b/g,
  /\baut(?:orizacao)?\b/g,
  /\baprov(?:ado|acao)?\b/g,
  /\bnsu\b/g,
  /\bref\b/g,
  /\bbr\b/g
];

const LOCATION_NOISE_PATTERNS = [
  /\bsao paulo\b/g,
  /\brio de janeiro\b/g,
  /\bbelo horizonte\b/g,
  /\bcuritiba\b/g,
  /\bporto alegre\b/g,
  /\bbrasil\b/g
];

export function normalizeClassificationText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeClassificationKeyword(keyword: string) {
  return normalizeClassificationText(keyword);
}

export function tokenizeClassificationText(value: string) {
  return normalizeClassificationText(value)
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

export function stripBankStatementNoise(value: string) {
  let normalized = normalizeClassificationText(value);

  normalized = normalized
    .replace(/\b\d{1,2}\s*\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ")
    .replace(/\b\d{6,}\b/g, " ");

  for (const pattern of BANK_STATEMENT_NOISE_PATTERNS) {
    normalized = normalized.replace(pattern, " ");
  }

  for (const pattern of LOCATION_NOISE_PATTERNS) {
    normalized = normalized.replace(pattern, " ");
  }

  return normalized.replace(/\s+/g, " ").trim();
}

export function buildNormalizedClassificationText(description: string, notes?: string | null) {
  return normalizeClassificationText(`${description} ${notes ?? ""}`);
}

export function buildNormalizedBankStatementText(description: string, notes?: string | null) {
  return stripBankStatementNoise(`${description} ${notes ?? ""}`);
}
