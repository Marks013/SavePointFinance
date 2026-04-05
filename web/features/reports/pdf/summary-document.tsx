import {
  Document,
  Page,
  StyleSheet,
  Text,
  View
} from "@react-pdf/renderer";

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
    padding: 32,
    fontSize: 11,
    color: "#1c1c1c"
  },
  title: {
    fontSize: 22,
    marginBottom: 6
  },
  subtitle: {
    color: "#555",
    marginBottom: 24
  },
  grid: {
    display: "flex",
    flexDirection: "row",
    gap: 12,
    marginBottom: 24
  },
  card: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    border: "1 solid #ddd2bf"
  },
  cardTitle: {
    fontSize: 10,
    color: "#666",
    marginBottom: 8
  },
  cardValue: {
    fontSize: 16
  },
  sectionTitle: {
    fontSize: 14,
    marginBottom: 12
  },
  section: {
    marginBottom: 22
  },
  row: {
    display: "flex",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottom: "1 solid #eee6d9"
  },
  muted: {
    color: "#666"
  },
  small: {
    fontSize: 10,
    color: "#666"
  }
});

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function SummaryDocument({ generatedAt, periodLabel, summary, recent, byAccount, byCard }: SummaryDocumentProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>SavePoint Relatório Financeiro</Text>
        <Text style={styles.subtitle}>Gerado em {generatedAt}</Text>
        <Text style={styles.subtitle}>{periodLabel}</Text>

        <View style={styles.grid}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Receitas</Text>
            <Text style={styles.cardValue}>{money(summary.income)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Despesas</Text>
            <Text style={styles.cardValue}>{money(summary.expense)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Saldo</Text>
            <Text style={styles.cardValue}>{money(summary.balance)}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Indicadores</Text>
          <View style={styles.row}>
            <Text>Transferências internas</Text>
            <Text>{money(summary.transfer)}</Text>
          </View>
          <View style={styles.row}>
            <Text>Movimentações consideradas</Text>
            <Text>{summary.transactions}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contas com maior impacto</Text>
          {byAccount.length > 0 ? (
            byAccount.map((item) => (
              <View key={item.id} style={styles.row}>
                <View>
                  <Text>{item.name}</Text>
                  <Text style={styles.small}>
                    Entradas {money(item.income)} • Saídas {money(item.expense)}
                  </Text>
                </View>
                <Text>{money(item.net)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>Nenhuma conta impactada no período selecionado.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cartões em destaque</Text>
          {byCard.length > 0 ? (
            byCard.map((item) => (
              <View key={item.id} style={styles.row}>
                <View>
                  <Text>{item.name}</Text>
                  <Text style={styles.small}>
                    {item.brand} • {item.transactions} lançamentos
                  </Text>
                </View>
                <Text>{money(item.netStatement)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>Nenhum cartão teve movimentação no período selecionado.</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Movimentações recentes</Text>
        {recent.length > 0 ? (
          recent.map((item) => (
            <View key={`${item.date}-${item.description}`} style={styles.row}>
              <View>
                <Text>{item.description}</Text>
                <Text style={styles.muted}>
                  {item.category} • {new Date(item.date).toLocaleDateString("pt-BR")}
                </Text>
                <Text style={styles.small}>
                  {item.card ?? item.account ?? "Sem origem"}
                  {item.destinationAccount ? ` → ${item.destinationAccount}` : ""}
                </Text>
              </View>
              <Text>{money(item.amount)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>Nenhuma movimentação foi encontrada para o período selecionado.</Text>
        )}
      </Page>
    </Document>
  );
}
