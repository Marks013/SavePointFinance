import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatDateDisplay } from "@/lib/date";

type HighlightItem = {
  label: string;
  value: string;
  support?: string;
};

type QuarterItem = {
  label: string;
  income: number;
  expense: number;
  balance: number;
};

type MonthlyItem = {
  label: string;
  income: number;
  expense: number;
  transfer: number;
  balance?: number;
  savingsRate?: number;
};

type SummaryDocumentProps = {
  generatedAt: string;
  title: string;
  subtitle: string;
  periodLabel: string;
  filtersLabel: string;
  periodScope: "month" | "year" | "custom";
  periodMonths: number;
  executiveSummary: {
    tone?: "positive" | "attention" | "warning";
    headline?: string;
    summary?: string;
    focus?: string;
    bullets?: string[];
  };
  summary: {
    income: number;
    expense: number;
    balance: number;
    transfer: number;
    transactions: number;
    averageDailyExpense: number;
    savingsRate: number;
    uncategorizedExpense: number;
  };
  classification: {
    autoClassified: number;
    uncategorized: number;
    coverage: number;
  };
  spendingInsights: {
    topCategory: {
      id: string | null;
      name: string;
      total: number;
      items: number;
      share: number;
    } | null;
  };
  comparison: {
    averageIncome: number;
    averageExpense: number;
    transferShare: number;
    topAccount: {
      id: string;
      name: string;
      net: number;
    } | null;
    topCard: {
      id: string;
      name: string;
      brand: string;
      netStatement: number;
      transactions: number;
    } | null;
  };
  recent: Array<{
    description: string;
    amount: number;
    type: string;
    date: string;
    category: string;
    account: string | null;
    destinationAccount: string | null;
    card: string | null;
  }>;
  byAccount: Array<{
    id: string;
    name: string;
    income: number;
    expense: number;
    transferIn: number;
    transferOut: number;
    net: number;
  }>;
  byCard: Array<{
    id: string;
    name: string;
    brand: string;
    spent: number;
    refunds: number;
    netStatement: number;
    transactions: number;
  }>;
  labels?: {
    periodTitle?: string;
    periodSubtitle?: string;
  };
  annualInsights?: {
    narrative?: {
      headline?: string;
      summary?: string;
      tone?: "positive" | "attention" | "warning";
      focus?: string;
      bullets?: string[];
    };
    highlights?: {
      bestMonth?: { label: string; balance: number } | null;
      worstMonth?: { label: string; balance: number } | null;
      highestIncomeMonth?: { label: string; income: number } | null;
      highestExpenseMonth?: { label: string; expense: number } | null;
      strongestQuarter?: { label: string; balance: number } | null;
      weakestQuarter?: { label: string; balance: number } | null;
    };
    cadence?: {
      positiveMonths?: number;
      negativeMonths?: number;
      activeMonths?: number;
      averageMonthlyBalance?: number;
    };
    concentration?: {
      topCategoriesShare?: number;
      uncategorizedExpenseShare?: number;
    };
    quarters?: QuarterItem[];
  };
  monthly?: MonthlyItem[];
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 30,
    fontSize: 10,
    color: "#1b2529",
    backgroundColor: "#f8f4ec"
  },
  hero: {
    marginBottom: 16,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#17372f"
  },
  eyebrow: {
    fontSize: 8.5,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "#d7e8df",
    marginBottom: 7
  },
  title: {
    fontSize: 22,
    color: "#ffffff",
    marginBottom: 5
  },
  subtitle: {
    fontSize: 10,
    color: "#d7e8df",
    lineHeight: 1.45,
    marginBottom: 2
  },
  heroMeta: {
    marginTop: 8,
    paddingTop: 8,
    borderTop: "1 solid rgba(255,255,255,0.14)"
  },
  heroMetaText: {
    fontSize: 8.8,
    color: "#d7e8df",
    marginBottom: 2
  },
  executivePanel: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fffdf8",
    border: "1 solid #ddd2bf"
  },
  executiveHeadline: {
    fontSize: 12.5,
    color: "#182126",
    marginBottom: 6
  },
  executiveSummary: {
    fontSize: 9.5,
    color: "#516059",
    lineHeight: 1.55,
    marginBottom: 8
  },
  executiveBullet: {
    fontSize: 9.3,
    color: "#516059",
    lineHeight: 1.5,
    marginBottom: 3
  },
  metricsGrid: {
    display: "flex",
    flexDirection: "row",
    gap: 10,
    marginBottom: 16
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fffdf8",
    border: "1 solid #ddd2bf"
  },
  metricLabel: {
    fontSize: 8.6,
    color: "#5b675e",
    marginBottom: 8
  },
  metricValue: {
    fontSize: 14.5,
    color: "#182126"
  },
  metricSupport: {
    marginTop: 5,
    fontSize: 8.5,
    color: "#5b675e",
    lineHeight: 1.4
  },
  positive: {
    color: "#136f4f"
  },
  negative: {
    color: "#cb684c"
  },
  warning: {
    color: "#9a5d12"
  },
  section: {
    marginBottom: 16
  },
  sectionHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 9
  },
  sectionTitle: {
    fontSize: 12.5,
    color: "#182126"
  },
  sectionMeta: {
    fontSize: 8.8,
    color: "#5b675e"
  },
  splitGrid: {
    display: "flex",
    flexDirection: "row",
    gap: 12
  },
  splitColumn: {
    flex: 1
  },
  panel: {
    borderRadius: 14,
    border: "1 solid #e5dac9",
    backgroundColor: "#fffdf8",
    overflow: "hidden"
  },
  row: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottom: "1 solid #efe6d8"
  },
  rowLast: {
    borderBottom: "0 solid transparent"
  },
  rowContent: {
    flex: 1
  },
  rowTitle: {
    fontSize: 10.2,
    color: "#182126"
  },
  rowMeta: {
    marginTop: 3,
    fontSize: 8.6,
    color: "#5b675e",
    lineHeight: 1.45
  },
  amount: {
    fontSize: 10.2,
    textAlign: "right"
  },
  highlightGrid: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  highlightCard: {
    width: "48%",
    borderRadius: 14,
    border: "1 solid #e5dac9",
    backgroundColor: "#fffdf8",
    padding: 11
  },
  highlightLabel: {
    fontSize: 8.4,
    color: "#5b675e",
    marginBottom: 6,
    textTransform: "uppercase"
  },
  highlightValue: {
    fontSize: 11.6,
    color: "#182126",
    marginBottom: 4
  },
  highlightSupport: {
    fontSize: 8.6,
    color: "#5b675e",
    lineHeight: 1.4
  },
  empty: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 9.2,
    color: "#5b675e"
  },
  footer: {
    marginTop: 8,
    paddingTop: 10,
    borderTop: "1 solid #ddd2bf",
    fontSize: 8.4,
    color: "#5b675e"
  }
});

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function amountStyle(value: number) {
  if (value < 0) {
    return [styles.amount, styles.negative];
  }

  if (value > 0) {
    return [styles.amount, styles.positive];
  }

  return [styles.amount];
}

function metricToneStyle(value: number) {
  if (value < 0) {
    return [styles.metricValue, styles.negative];
  }

  if (value > 0) {
    return [styles.metricValue, styles.positive];
  }

  return [styles.metricValue];
}

function toneStyle(tone?: "positive" | "attention" | "warning") {
  if (tone === "warning") {
    return [styles.executiveHeadline, styles.negative];
  }

  if (tone === "positive") {
    return [styles.executiveHeadline, styles.positive];
  }

  return [styles.executiveHeadline, styles.warning];
}

function rowStyle(isLast: boolean) {
  return isLast ? [styles.row, styles.rowLast] : [styles.row];
}

function buildFallbackHighlights({
  periodScope,
  classification,
  spendingInsights,
  comparison,
  summary
}: Pick<
  SummaryDocumentProps,
  "periodScope" | "classification" | "spendingInsights" | "comparison" | "summary"
>): HighlightItem[] {
  const fallback: HighlightItem[] = [
    {
      label: "Cobertura de classificacao",
      value: percent(classification.coverage),
      support: `${classification.uncategorized} lancamentos ainda sem categoria final.`
    },
    {
      label: periodScope === "year" ? "Media mensal de despesas" : "Despesa media diaria",
      value: periodScope === "year" ? money(comparison.averageExpense) : money(summary.averageDailyExpense),
      support:
        periodScope === "year"
          ? `Receitas medias de ${money(comparison.averageIncome)} por mes.`
          : "Indicador util para acompanhar ritmo de consumo ao longo do periodo."
    }
  ];

  if (spendingInsights.topCategory) {
    fallback.push({
      label: "Categoria dominante",
      value: spendingInsights.topCategory.name,
      support: `${money(spendingInsights.topCategory.total)} • ${percent(spendingInsights.topCategory.share)} das despesas.`
    });
  }

  if (comparison.topAccount) {
    fallback.push({
      label: "Conta com maior impacto",
      value: comparison.topAccount.name,
      support: `Impacto liquido de ${money(comparison.topAccount.net)}.`
    });
  }

  return fallback.slice(0, 4);
}

function buildFallbackQuarters(monthly: MonthlyItem[] = []): QuarterItem[] {
  if (monthly.length < 3) {
    return [];
  }

  const quarters = new Map<string, QuarterItem>();

  monthly.forEach((item, index) => {
    const quarterLabel = `T${Math.floor(index / 3) + 1}`;
    const current = quarters.get(quarterLabel) ?? {
      label: quarterLabel,
      income: 0,
      expense: 0,
      balance: 0
    };

    current.income += item.income;
    current.expense += item.expense;
    current.balance += item.balance ?? item.income - item.expense;
    quarters.set(quarterLabel, current);
  });

  return Array.from(quarters.values()).slice(0, 4);
}

function buildAnnualHighlights(annualInsights?: SummaryDocumentProps["annualInsights"]): HighlightItem[] {
  if (!annualInsights?.highlights) {
    return [];
  }

  const items: Array<HighlightItem | null> = [
    annualInsights.highlights.bestMonth
      ? {
          label: "Melhor mes",
          value: annualInsights.highlights.bestMonth.label,
          support: money(annualInsights.highlights.bestMonth.balance)
        }
      : null,
    annualInsights.highlights.worstMonth
      ? {
          label: "Mes mais pressionado",
          value: annualInsights.highlights.worstMonth.label,
          support: money(annualInsights.highlights.worstMonth.balance)
        }
      : null,
    annualInsights.highlights.strongestQuarter
      ? {
          label: "Melhor trimestre",
          value: annualInsights.highlights.strongestQuarter.label,
          support: money(annualInsights.highlights.strongestQuarter.balance)
        }
      : null,
    annualInsights.highlights.weakestQuarter
      ? {
          label: "Trimestre mais fraco",
          value: annualInsights.highlights.weakestQuarter.label,
          support: money(annualInsights.highlights.weakestQuarter.balance)
        }
      : null
  ];

  return items.filter((item): item is HighlightItem => item !== null);
}

export function SummaryDocument({
  generatedAt,
  title,
  subtitle,
  periodLabel,
  filtersLabel,
  periodScope,
  periodMonths,
  executiveSummary,
  summary,
  classification,
  spendingInsights,
  comparison,
  recent,
  byAccount,
  byCard,
  labels,
  annualInsights,
  monthly
}: SummaryDocumentProps) {
  const resolvedNarrative = annualInsights?.narrative ?? executiveSummary;
  const resolvedHighlights =
    buildAnnualHighlights(annualInsights).length > 0
      ? buildAnnualHighlights(annualInsights)
      : buildFallbackHighlights({
          periodScope,
          classification,
          spendingInsights,
          comparison,
          summary
        });
  const resolvedQuarters =
    annualInsights?.quarters && annualInsights.quarters.length > 0
      ? annualInsights.quarters
      : buildFallbackQuarters(monthly);
  const cadenceLabel =
    annualInsights?.cadence && annualInsights.cadence.activeMonths
      ? `${annualInsights.cadence.positiveMonths ?? 0} meses positivos em ${
          annualInsights.cadence.activeMonths
        } meses ativos`
      : periodScope === "year"
        ? `${periodMonths} meses considerados no consolidado`
        : `${summary.transactions} movimentacoes analisadas`;
  const concentrationLabel =
    annualInsights?.concentration?.topCategoriesShare !== undefined
      ? `${percent(annualInsights.concentration.topCategoriesShare)} das despesas concentradas nas categorias lideres`
      : spendingInsights.topCategory
        ? `${spendingInsights.topCategory.name} lidera com ${percent(spendingInsights.topCategory.share)}`
        : "Sem concentracao dominante no recorte";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>SavePoint Finance</Text>
          <Text style={styles.title}>{labels?.periodTitle ?? title}</Text>
          <Text style={styles.subtitle}>{labels?.periodSubtitle ?? subtitle}</Text>
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaText}>{periodLabel}</Text>
            <Text style={styles.heroMetaText}>{filtersLabel}</Text>
            <Text style={styles.heroMetaText}>Gerado em {generatedAt}</Text>
          </View>
        </View>

        <View style={styles.executivePanel}>
          <Text style={toneStyle(resolvedNarrative.tone)}>{resolvedNarrative.headline ?? "Leitura executiva do periodo"}</Text>
          <Text style={styles.executiveSummary}>
            {resolvedNarrative.summary ??
              "Resumo gerencial para leitura rapida de resultado, concentracao de despesa e pontos de atencao do periodo."}
          </Text>
          {(resolvedNarrative.focus ? [resolvedNarrative.focus] : []).concat(resolvedNarrative.bullets ?? []).slice(0, 3).map((item) => (
            <Text key={item} style={styles.executiveBullet}>
              • {item}
            </Text>
          ))}
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Resultado do periodo</Text>
            <Text style={metricToneStyle(summary.balance)}>{money(summary.balance)}</Text>
            <Text style={styles.metricSupport}>{cadenceLabel}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Receitas</Text>
            <Text style={[styles.metricValue, styles.positive]}>{money(summary.income)}</Text>
            <Text style={styles.metricSupport}>Taxa de poupanca de {percent(summary.savingsRate)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Despesas</Text>
            <Text style={[styles.metricValue, styles.negative]}>{money(summary.expense)}</Text>
            <Text style={styles.metricSupport}>{concentrationLabel}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Transferencias</Text>
            <Text style={styles.metricValue}>{money(summary.transfer)}</Text>
            <Text style={styles.metricSupport}>Fluxo interno de {percent(comparison.transferShare)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Destaques gerenciais</Text>
            <Text style={styles.sectionMeta}>
              {periodScope === "year" ? "Panorama anual" : "Panorama operacional"}
            </Text>
          </View>
          <View style={styles.highlightGrid}>
            {resolvedHighlights.map((item) => (
              <View key={`${item.label}-${item.value}`} style={styles.highlightCard}>
                <Text style={styles.highlightLabel}>{item.label}</Text>
                <Text style={styles.highlightValue}>{item.value}</Text>
                {item.support ? <Text style={styles.highlightSupport}>{item.support}</Text> : null}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Drivers do periodo</Text>
            <Text style={styles.sectionMeta}>
              {resolvedQuarters.length > 0 ? `${resolvedQuarters.length} blocos de leitura` : "Contas e cartoes"}
            </Text>
          </View>
          <View style={styles.splitGrid}>
            <View style={styles.splitColumn}>
              <View style={styles.panel}>
                {resolvedQuarters.length > 0 ? (
                  resolvedQuarters.slice(0, 4).map((item, index) => (
                    <View key={item.label} style={rowStyle(index === resolvedQuarters.slice(0, 4).length - 1)}>
                      <View style={styles.rowContent}>
                        <Text style={styles.rowTitle}>{item.label}</Text>
                        <Text style={styles.rowMeta}>
                          Receitas {money(item.income)} • Despesas {money(item.expense)}
                        </Text>
                      </View>
                      <Text style={amountStyle(item.balance)}>{money(item.balance)}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.empty}>Ainda nao ha serie suficiente para leitura consolidada por trimestre.</Text>
                )}
              </View>
            </View>
            <View style={styles.splitColumn}>
              <View style={styles.panel}>
                {byAccount.length > 0 ? (
                  byAccount.slice(0, 4).map((item, index) => (
                    <View key={item.id} style={rowStyle(index === byAccount.slice(0, 4).length - 1)}>
                      <View style={styles.rowContent}>
                        <Text style={styles.rowTitle}>{item.name}</Text>
                        <Text style={styles.rowMeta}>
                          Entradas {money(item.income)} • Saidas {money(item.expense)} • Transf.{" "}
                          {money(item.transferIn - item.transferOut)}
                        </Text>
                      </View>
                      <Text style={amountStyle(item.net)}>{money(item.net)}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.empty}>Nenhuma conta impactada no periodo selecionado.</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Cartoes e movimentacoes recentes</Text>
            <Text style={styles.sectionMeta}>
              {comparison.topCard ? `${comparison.topCard.name} lidera o impacto em cartao` : `${recent.length} itens recentes`}
            </Text>
          </View>
          <View style={styles.splitGrid}>
            <View style={styles.splitColumn}>
              <View style={styles.panel}>
                {byCard.length > 0 ? (
                  byCard.slice(0, 4).map((item, index) => (
                    <View key={item.id} style={rowStyle(index === byCard.slice(0, 4).length - 1)}>
                      <View style={styles.rowContent}>
                        <Text style={styles.rowTitle}>{item.name}</Text>
                        <Text style={styles.rowMeta}>
                          {item.brand} • {item.transactions} lancamentos • Reembolsos {money(item.refunds)}
                        </Text>
                      </View>
                      <Text style={amountStyle(item.netStatement)}>{money(item.netStatement)}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.empty}>Nenhum cartao teve movimentacao no periodo selecionado.</Text>
                )}
              </View>
            </View>
            <View style={styles.splitColumn}>
              <View style={styles.panel}>
                {recent.length > 0 ? (
                  recent.slice(0, 4).map((item, index) => (
                    <View key={`${item.date}-${item.description}-${index}`} style={rowStyle(index === recent.slice(0, 4).length - 1)}>
                      <View style={styles.rowContent}>
                        <Text style={styles.rowTitle}>{item.description}</Text>
                        <Text style={styles.rowMeta}>
                          {item.category} • {formatDateDisplay(item.date)}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {item.card ?? item.account ?? "Sem origem"}
                          {item.destinationAccount ? ` -> ${item.destinationAccount}` : ""}
                        </Text>
                      </View>
                      <Text
                        style={amountStyle(
                          item.type === "expense" ? -Math.abs(item.amount) : item.type === "income" ? item.amount : 0
                        )}
                      >
                        {money(item.amount)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.empty}>Nenhuma movimentacao foi encontrada para o periodo selecionado.</Text>
                )}
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.footer}>
          SavePoint Finance • Relatorio gerencial preparado para leitura executiva, acompanhamento operacional e revisao de fechamento.
        </Text>
      </Page>
    </Document>
  );
}
