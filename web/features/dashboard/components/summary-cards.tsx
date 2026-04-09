import { ArrowDownCircle, ArrowUpCircle, Landmark } from "lucide-react";

import { formatCurrency } from "@/lib/utils";

type SummaryCardsProps = {
  data: {
    openingBalance: number;
    closingBalance: number;
    income: number;
    expenses: number;
    averageDailyExpense: number;
  };
};

const cards = [
  {
    key: "openingBalance",
    title: "Saldo inicial do período",
    note: "Caixa real das contas no início da competência",
    accent: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
    icon: Landmark,
    valueClass: (value: number) => (value < 0 ? "amount-negative" : "text-[var(--color-foreground)]")
  },
  {
    key: "closingBalance",
    title: "Saldo final do período",
    note: "Caixa real das contas ao fim da competência",
    accent: "bg-[var(--color-card)] text-[var(--color-primary)] border border-[var(--color-border)]",
    icon: Landmark,
    valueClass: (value: number) => (value < 0 ? "amount-negative" : "text-[var(--color-foreground)]")
  },
  {
    key: "income",
    title: "Receitas do período",
    note: "Entradas registradas na competência selecionada",
    accent: "bg-[var(--color-card)] text-[var(--color-emerald-600)] border border-[var(--color-border)]",
    icon: ArrowUpCircle,
    valueClass: () => "amount-positive"
  },
  {
    key: "expenses",
    title: "Despesas do período",
    note: "Saídas lançadas pela competência financeira",
    accent: "bg-[var(--color-card)] text-[var(--color-coral-500)] border border-[var(--color-border)]",
    icon: ArrowDownCircle,
    valueClass: () => "amount-negative"
  },
  {
    key: "averageDailyExpense",
    title: "Despesa média diária",
    note: "Ritmo médio de saída dentro do período",
    accent: "bg-[var(--color-card)] text-[var(--color-ink-900)] border border-[var(--color-border)]",
    icon: ArrowDownCircle,
    valueClass: () => "amount-negative"
  }
] as const;

export function SummaryCards({ data }: SummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = data[card.key];

        return (
          <article aria-label={card.title} key={card.key} className="metric-card">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="metric-label">{card.title}</p>
                <p
                  className={`mt-4 break-words text-[clamp(1.2rem,3.4vw,1.92rem)] font-medium tracking-[-0.04em] ${card.valueClass(value)}`}
                >
                  {formatCurrency(value)}
                </p>
                <p className="mt-3 text-sm leading-6 text-[var(--color-ink-700)]">{card.note}</p>
              </div>
              <div className={`flex size-11 shrink-0 items-center justify-center rounded-[1.1rem] ${card.accent}`}>
                <Icon className="size-5" />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
