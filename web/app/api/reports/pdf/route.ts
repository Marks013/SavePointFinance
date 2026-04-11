import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { SummaryDocument } from "@/features/reports/pdf/summary-document";
import { syncDueSubscriptionTransactions } from "@/lib/automation/subscriptions";
import { requireSessionUser } from "@/lib/auth/session";
import { formatDateTimeDisplay } from "@/lib/date";
import { getFinanceReport } from "@/lib/finance/reports";
import { getMonthRange, normalizeMonthKey } from "@/lib/month";

type ExtendedReport = Awaited<ReturnType<typeof getFinanceReport>>;
type ExecutiveSummary = {
  tone: "positive" | "attention" | "warning";
  headline: string;
  summary: string;
  focus: string;
  bullets?: string[];
};

function formatScopeLabel(scope: "month" | "year" | "custom", from?: string | null, to?: string | null) {
  if (scope === "year" && from) {
    return `Exercicio ${from.slice(0, 4)}`;
  }

  if (scope === "month" && from) {
    const [year, month] = from.split("-").map(Number);

    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric"
    }).format(new Date(year ?? 0, (month ?? 1) - 1, 1));
  }

  if (from && to) {
    return `${from} a ${to}`;
  }

  return "Consolidado geral";
}

function buildExecutiveSummary(report: ExtendedReport): ExecutiveSummary {
  if (report.annualInsights?.narrative) {
    return {
      tone: report.annualInsights.narrative.tone,
      headline: report.annualInsights.narrative.headline,
      summary: report.annualInsights.narrative.summary,
      focus: report.annualInsights.narrative.focus
    };
  }

  const tone: ExecutiveSummary["tone"] =
    report.summary.balance < 0
      ? "warning"
      : report.summary.savingsRate >= 0.15
        ? "positive"
        : "attention";
  const headline =
    tone === "warning"
      ? "O periodo encerrou com pressao sobre o caixa."
      : tone === "positive"
        ? "O periodo encerrou com resultado favoravel e margem de poupanca consistente."
        : "O periodo encerrou positivo, mas pede leitura cuidadosa da composicao dos gastos.";
  const bullets = [
    `Resultado consolidado de ${report.summary.balance.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL"
    })} com ${report.summary.transactions} movimentacoes no recorte.`,
    report.comparison.topCategory
      ? `Maior pressao de despesa em ${report.comparison.topCategory.name}, responsavel por ${Math.round(
          report.comparison.topCategory.share * 100
        )}% dos gastos.`
      : "Sem categoria dominante de despesa no recorte atual.",
    `Cobertura de classificacao em ${Math.round(report.classification.coverage * 100)}% e taxa de poupanca em ${Math.round(
      report.summary.savingsRate * 100
    )}%.`
  ];

  return {
    tone,
    headline,
    summary:
      report.period.scope === "year"
        ? "Leitura anual orientada a desempenho, concentracao de despesas e saude operacional."
        : "Leitura gerencial focada em fluxo, disciplina de gasto e capacidade de fechamento do periodo.",
    focus: report.comparison.topCategory
      ? `Principal pressao em ${report.comparison.topCategory.name}, com ${Math.round(
          report.comparison.topCategory.share * 100
        )}% das despesas.`
      : "Sem categoria dominante de despesa no recorte atual.",
    bullets
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser({ feature: "pdfExport" });
    await syncDueSubscriptionTransactions({
      tenantId: user.tenantId,
      userId: user.id
    });
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const resolvedMonth = month ? normalizeMonthKey(month) : null;
    const monthRange = resolvedMonth ? getMonthRange(resolvedMonth) : null;
    const report = (await getFinanceReport(user.tenantId, {
      from: searchParams.get("from") ?? monthRange?.from ?? null,
      to: searchParams.get("to") ?? monthRange?.to ?? null,
      baseMonth: resolvedMonth,
      type: searchParams.get("type"),
      accountId: searchParams.get("accountId"),
      cardId: searchParams.get("cardId"),
      categoryId: searchParams.get("categoryId")
    })) as ExtendedReport;
    const scopeLabel = formatScopeLabel(report.period.scope, report.filters.from, report.filters.to);
    const periodParts = [
      report.filters.from ? `Inicio ${report.filters.from}` : null,
      report.filters.to ? `Fim ${report.filters.to}` : null,
      report.filters.type ? `Tipo ${report.filters.type}` : null
    ].filter(Boolean);
    const documentTitle =
      report.period.scope === "year"
        ? "Relatorio anual de performance financeira"
        : report.period.scope === "month"
          ? "Relatorio mensal de performance financeira"
          : "Relatorio gerencial financeiro";
    const filename =
      report.period.scope === "year"
        ? `savepoint-relatorio-anual-${report.filters.from?.slice(0, 4) ?? "geral"}.pdf`
        : report.period.scope === "month"
          ? `savepoint-relatorio-mensal-${resolvedMonth ?? "geral"}.pdf`
          : "savepoint-relatorio-gerencial.pdf";

    const document = SummaryDocument({
        generatedAt: formatDateTimeDisplay(new Date()),
        title: documentTitle,
        subtitle:
          report.period.scope === "year"
            ? "Consolidado executivo com foco em desempenho, concentracao e leitura gerencial do ano."
            : "Consolidado executivo com foco em fluxo, despesas e desempenho operacional do periodo.",
        periodLabel: `Periodo analisado: ${scopeLabel}`,
        filtersLabel: periodParts.length > 0 ? periodParts.join(" • ") : "Sem refinamentos adicionais",
        periodScope: report.period.scope,
        periodMonths: report.period.months,
        executiveSummary: buildExecutiveSummary(report),
        summary: report.summary,
        classification: report.classification,
        spendingInsights: report.spendingInsights,
        comparison: report.comparison,
        recent: report.recent,
        byAccount: report.byAccount.slice(0, 5),
        byCard: report.byCard.slice(0, 5),
        labels: report.labels,
        annualInsights: report.annualInsights,
        monthly: report.monthly
      }) as unknown as ReactElement<DocumentProps>;

    const pdf = await renderToBuffer(document);

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return new Response("Unauthorized", { status: 401 });
    }

    return new Response("Failed to generate PDF", { status: 500 });
  }
}
