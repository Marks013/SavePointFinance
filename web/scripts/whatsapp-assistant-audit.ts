import assert from "node:assert/strict";

function normalizeClassificationText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isReportIntent(normalized: string) {
  return /\b(relatorio|relatório|resumo|fechamento|como estou|visao do mes|visão do mês|gastos do mes|gastos do mês|maiores categorias)\b/.test(
    normalized
  );
}

function isExpenseIntent(normalized: string) {
  return /\b(gastei|paguei|comprei|gasto|despesa|debita|débita|lanca despesa|lança despesa|registra despesa|anota despesa)\b/.test(
    normalized
  );
}

function isIncomeIntent(normalized: string) {
  return /\b(recebi|ganhei|entrou|entrada|receita|credito|crédito|lanca receita|lança receita|registra receita|anota receita)\b/.test(
    normalized
  );
}

function isLaunchIntent(normalized: string) {
  return /\b(lanca|lança|registra|registre|anota|adicione|adiciona|cadastra|cadastre)\b/.test(normalized);
}

function isInstallmentsIntent(normalized: string) {
  return /\b(parcelad\w*|parcela\w*)\b/.test(normalized);
}

function parseCurrencyValue(text: string) {
  const match = text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:,\d{2})|\d+(?:\.\d{2})?)/);
  return match ? Number(match[1].replace(/\./g, "").replace(",", ".")) : null;
}

const cases = [
  {
    body: "Resumo do mês",
    check: (normalized: string) => isReportIntent(normalized)
  },
  {
    body: "Como estou este mês?",
    check: (normalized: string) => isReportIntent(normalized)
  },
  {
    body: "Lança 120 de farmácia no cartão Visa",
    check: (normalized: string, body: string) =>
      isLaunchIntent(normalized) && (isExpenseIntent(normalized) || Boolean(parseCurrencyValue(body)))
  },
  {
    body: "Registra uma receita de 3200 salário no Itaú",
    check: (normalized: string) => isLaunchIntent(normalized) && isIncomeIntent(normalized)
  },
  {
    body: "Gastei 42,50 no mercado",
    check: (normalized: string) => isExpenseIntent(normalized)
  },
  {
    body: "Qual os parcelados no meu cartão PicPay",
    check: (normalized: string) => isInstallmentsIntent(normalized)
  }
];

for (const testCase of cases) {
  const normalized = normalizeClassificationText(testCase.body);
  assert.equal(testCase.check(normalized, testCase.body), true, `Intent not detected for: ${testCase.body}`);
}

console.log("WhatsApp assistant audit passed.");
