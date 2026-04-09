import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import { formatDateDisplay } from "@/lib/date";

type SummaryDocumentProps = {
  generatedAt: string;
  periodLabel: string;
  summary: {
    income: number;
    expense: number;
    balance: number;
    transfer: number;
    transactions: number;
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
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 30,
    paddingBottom: 34,
    fontSize: 10.5,
    color: "#182126",
    backgroundColor: "#f8f4ec"
  },
  hero: {
    marginBottom: 18,
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#18342d"
  },
  eyebrow: {
    fontSize: 8.5,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#d5e5dd",
    marginBottom: 8
  },
  title: {
    fontSize: 22,
    color: "#ffffff",
    marginBottom: 6
  },
  subtitle: {
    fontSize: 10,
    color: "#d5e5dd",
    marginBottom: 2
  },
  metricsGrid: {
    display: "flex",
    flexDirection: "row",
    gap: 10,
    marginBottom: 18
  },
  metricCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fffdf8",
    border: "1 solid #ddd2bf"
  },
  metricLabel: {
    fontSize: 9,
    color: "#5b675e",
    marginBottom: 8
  },
  metricValue: {
    fontSize: 15,
    color: "#182126"
  },
  positive: {
    color: "#136f4f"
  },
  negative: {
    color: "#cb684c"
  },
  section: {
    marginBottom: 18
  },
  sectionHeader: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  sectionTitle: {
    fontSize: 13,
    color: "#182126"
  },
  sectionMeta: {
    fontSize: 9,
    color: "#5b675e"
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
  rowTitle: {
    fontSize: 10.5,
    color: "#182126"
  },
  rowMeta: {
    marginTop: 3,
    fontSize: 8.8,
    color: "#5b675e",
    lineHeight: 1.45
  },
  amount: {
    fontSize: 10.5,
    textAlign: "right"
  },
  empty: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 9.5,
    color: "#5b675e"
  },
  footer: {
    marginTop: 12,
    paddingTop: 12,
    borderTop: "1 solid #ddd2bf",
    fontSize: 8.5,
    color: "#5b675e"
  }
});

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
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

function rowStyle(isLast: boolean) {
  return isLast ? [styles.row, styles.rowLast] : [styles.row];
}

export function SummaryDocument({ generatedAt, periodLabel, summary, recent, byAccount, byCard }: SummaryDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>SavePoint Financas</Text>
          <Text style={styles.title}>Relatorio financeiro consolidado</Text>
          <Text style={styles.subtitle}>{periodLabel}</Text>
          <Text style={styles.subtitle}>Gerado em {generatedAt}</Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Receitas</Text>
            <Text style={[styles.metricValue, styles.positive]}>{money(summary.income)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Despesas</Text>
            <Text style={[styles.metricValue, styles.negative]}>{money(summary.expense)}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Resultado do período</Text>
            <Text style={[styles.metricValue, summary.balance < 0 ? styles.negative : styles.positive]}>
              {money(summary.balance)}
            </Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Transferencias</Text>
            <Text style={styles.metricValue}>{money(summary.transfer)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Contas com maior impacto</Text>
            <Text style={styles.sectionMeta}>{byAccount.length} contas consideradas</Text>
          </View>
          <View style={styles.panel}>
            {byAccount.length > 0 ? (
              byAccount.slice(0, 6).map((item, index) => (
                <View key={item.id} style={rowStyle(index === byAccount.slice(0, 6).length - 1)}>
                  <View>
                    <Text style={styles.rowTitle}>{item.name}</Text>
                    <Text style={styles.rowMeta}>
                      Entradas {money(item.income)} • Saidas {money(item.expense)} • Transf. {money(item.transferIn - item.transferOut)}
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

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Cartoes em destaque</Text>
            <Text style={styles.sectionMeta}>{byCard.length} cartoes com movimentacao</Text>
          </View>
          <View style={styles.panel}>
            {byCard.length > 0 ? (
              byCard.slice(0, 6).map((item, index) => (
                <View key={item.id} style={rowStyle(index === byCard.slice(0, 6).length - 1)}>
                  <View>
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

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Movimentacoes recentes</Text>
            <Text style={styles.sectionMeta}>{summary.transactions} movimentos no periodo</Text>
          </View>
          <View style={styles.panel}>
            {recent.length > 0 ? (
              recent.slice(0, 10).map((item, index) => (
                <View
                  key={`${item.date}-${item.description}-${index}`}
                  style={rowStyle(index === recent.slice(0, 10).length - 1)}
                >
                  <View>
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

        <Text style={styles.footer}>
          SavePoint Financas • Relatorio resumido para leitura gerencial e acompanhamento operacional.
        </Text>
      </Page>
    </Document>
  );
}
