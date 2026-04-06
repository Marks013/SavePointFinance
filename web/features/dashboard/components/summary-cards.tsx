import { ArrowDownCircle, ArrowUpCircle, Landmark, PiggyBank } from "lucide-react";

import { formatCurrency } from "@/lib/utils";

type SummaryCardsProps = {
  data: {
    balance: number;
    income: number;
    expenses: number;
    goals: number;
    averageDailyExpense: number;
  };
};

const cards = [
  {
    key: "balance",
    title: "Saldo consolidado",
    note: "Posicao total das contas ativas",
    accent: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
    icon: Landmark,
    valueClass: (value: number) => (value < 0 ? "amount-negative" : "text-[var(--color-foreground)]")
  },
  {
    key: "income",
    title: "Receitas do periodo",
    note: "Entradas registradas no mes",
    accent: "bg-[var(--color-card)] text-[var(--color-emerald-600)] border border-[var(--color-border)]",
    icon: ArrowUpCircle,
    valueClass: () => "amount-positive"
  },
  {
    key: "expenses",
    title: "Despesas do periodo",
    note: "Saidas e compromissos ja lancados",
    accent: "bg-[var(--color-card)] text-[var(--color-coral-500)] border border-[var(--color-border)]",
    icon: ArrowDownCircle,
    valueClass: () => "amount-negative"
  },
  {
    key: "goals",
    title: "Reservado em metas",
    note: "Valor comprometido com objetivos",
    accent: "bg-[var(--color-card)] text-[var(--color-gold-500)] border border-[var(--color-border)]",
    icon: PiggyBank,
    valueClass: () => "text-[var(--color-gold-500)]"
  },
  {
    key: "averageDailyExpense",
    title: "Despesa media diaria",
    note: "Ritmo medio de saida no periodo",
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
              <div>
                <p className="metric-label">{card.title}</p>
                <p
                  className={`mt-4 whitespace-nowrap text-[clamp(1.45rem,2vw,1.92rem)] font-medium tracking-[-0.04em] ${card.valueClass(value)}`}
                >
                  {formatCurrency(value)}
                </p>
                <p className="mt-3 text-sm leading-6 text-[var(--color-ink-700)]">{card.note}</p>
              </div>
              <div className={`flex size-11 items-center justify-center rounded-[1.1rem] ${card.accent}`}>
                <Icon className="size-5" />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
