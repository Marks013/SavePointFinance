import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";

import { SummaryDocument } from "@/features/reports/pdf/summary-document";
import { requireSessionUser } from "@/lib/auth/session";
import { getFinanceReport } from "@/lib/finance/reports";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser({ feature: "pdfExport" });
    const { searchParams } = new URL(request.url);
    const report = await getFinanceReport(user.tenantId, {
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      type: searchParams.get("type"),
      accountId: searchParams.get("accountId"),
      cardId: searchParams.get("cardId"),
      categoryId: searchParams.get("categoryId")
    });
    const periodParts = [
      report.filters.from ? `De ${report.filters.from}` : null,
      report.filters.to ? `até ${report.filters.to}` : null,
      report.filters.type ? `Tipo: ${report.filters.type}` : null
    ].filter(Boolean);

    const document = SummaryDocument({
        generatedAt: new Date().toLocaleString("pt-BR"),
        periodLabel: periodParts.length > 0 ? `Período: ${periodParts.join(" • ")}` : "Período: consolidado geral",
        recent: report.recent,
        summary: report.summary,
        byAccount: report.byAccount.slice(0, 5),
        byCard: report.byCard.slice(0, 5)
      }) as unknown as ReactElement<DocumentProps>;

    const pdf = await renderToBuffer(document);

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="savepoint-summary.pdf"'
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return new Response("Unauthorized", { status: 401 });
    }

    return new Response("Failed to generate PDF", { status: 500 });
  }
}
