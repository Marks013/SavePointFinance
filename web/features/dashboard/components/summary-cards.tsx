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
    note: "Posição total das contas ativas",
    accent: "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]",
    icon: Landmark
  },
  {
    key: "income",
    title: "Receitas do período",
    note: "Entradas registradas no mês",
    accent: "bg-[var(--color-card)] text-[var(--color-emerald-600)] border border-[var(--color-border)]",
    icon: ArrowUpCircle
  },
  {
    key: "expenses",
    title: "Despesas do período",
    note: "Saídas e compromissos já lançados",
    accent: "bg-[var(--color-card)] text-[var(--color-coral-500)] border border-[var(--color-border)]",
    icon: ArrowDownCircle
  },
  {
    key: "goals",
    title: "Reservado em metas",
    note: "Valor comprometido com objetivos",
    accent: "bg-[var(--color-card)] text-[var(--color-gold-500)] border border-[var(--color-border)]",
    icon: PiggyBank
  },
  {
    key: "averageDailyExpense",
    title: "Despesa média diária",
    note: "Ritmo médio de saída no período",
    accent: "bg-[var(--color-card)] text-[var(--color-ink-900)] border border-[var(--color-border)]",
    icon: ArrowDownCircle
  }
] as const;

export function SummaryCards({ data }: SummaryCardsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = data[card.key];

        return (
          <article
            aria-label={card.title}
            key={card.key}
            className="metric-card"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="metric-label">{card.title}</p>
                <p className="mt-4 whitespace-nowrap text-[clamp(1.45rem,2vw,1.92rem)] font-medium tracking-[-0.04em] text-[var(--color-foreground)]">
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
