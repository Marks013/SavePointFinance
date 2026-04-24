import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Check, CircleDollarSign, LockKeyhole, MessageCircleMore, ShieldCheck, Sparkles, X } from "lucide-react";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";
import { PlanCheckoutLink } from "@/features/billing/components/plan-checkout-link";

const planCards = [
  {
    name: "Gratuito Essencial",
    label: "Para começar com controle básico",
    price: "R$ 0",
    cadence: "sem cobrança",
    tone: "muted",
    href: "/cadastro?plan=free" as Route,
    cta: "Criar conta gratuita",
    features: [
      { label: "1 conta financeira", enabled: true },
      { label: "1 cartão cadastrado", enabled: true },
      { label: "Transações, metas e parcelas", enabled: true },
      { label: "Relatórios no painel", enabled: true },
      { label: "WhatsApp financeiro", enabled: false },
      { label: "Automações e recorrências avançadas", enabled: false },
      { label: "Exportação em PDF", enabled: false }
    ]
  },
  {
    name: "Premium Completo",
    label: "Para operar a rotina financeira sem limites práticos",
    price: "Assinatura",
    cadence: "via Mercado Pago",
    tone: "strong",
    href: "/cadastro?plan=pro" as Route,
    cta: "Assinar mensal",
    annualHref: "/cadastro?plan=pro_annual" as Route,
    annualCta: "Pagar anual com desconto",
    features: [
      { label: "Contas financeiras ilimitadas", enabled: true },
      { label: "Cartões ilimitados", enabled: true },
      { label: "Transações, metas e parcelas", enabled: true },
      { label: "Relatórios mensais e anuais", enabled: true },
      { label: "WhatsApp financeiro", enabled: true },
      { label: "Automações e recorrências avançadas", enabled: true },
      { label: "Exportação em PDF", enabled: true }
    ]
  },
  {
    name: "Avaliação Premium",
    label: "Para testar recursos premium antes da assinatura",
    price: "14 dias",
    cadence: "sem cobrança inicial",
    tone: "accent",
    href: "/cadastro?plan=trial" as Route,
    cta: "Criar avaliação",
    features: [
      { label: "Recursos premium liberados", enabled: true },
      { label: "WhatsApp financeiro", enabled: true },
      { label: "Automações e PDF", enabled: true },
      { label: "Migração para assinatura paga", enabled: true },
      { label: "Cobrança automática sem contratação", enabled: false }
    ]
  }
];

const comparisonRows = [
  ["Contas financeiras", "1", "Ilimitadas", "Ilimitadas no período"],
  ["Cartões", "1", "Ilimitados", "Ilimitados no período"],
  ["WhatsApp", "Não incluso", "Incluso", "Incluso"],
  ["Automações", "Limitado", "Incluso", "Incluso"],
  ["PDF", "Não incluso", "Incluso", "Incluso"],
  ["Checkout", "Não necessário", "Mercado Pago", "Após upgrade"]
];

export default function PlansPage() {
  return (
    <main id="main-content" className="page-shell py-6 md:py-10">
      <section className="surface-strong overflow-hidden rounded-[42px] px-7 py-8 md:px-12 md:py-12">
        <div className="grid gap-8 xl:grid-cols-[1fr_0.8fr] xl:items-end">
          <div className="section-stack">
            <BrandMark inverted />
            <div className="eyebrow border-white/18 bg-white/10 text-white">Planos e assinatura</div>
            <h1 className="display-title max-w-5xl text-white">
              Escolha o nível certo para operar seu financeiro com controle, automação e WhatsApp.
            </h1>
            <p className="max-w-2xl text-base leading-8 text-white/82 md:text-lg">
              Compare limites, permissões e recursos antes de contratar. A assinatura premium usa Mercado Pago e a
              liberação acontece automaticamente após a confirmação do pagamento.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <PlanCheckoutLink>
                  Assinar mensal
                  <ArrowRight className="size-4" />
                </PlanCheckoutLink>
              </Button>
              <Button asChild variant="secondary">
                <PlanCheckoutLink
                  hrefWhenLoggedIn="/billing?intent=checkout&cycle=annual"
                  hrefWhenLoggedOut="/cadastro?plan=pro_annual"
                >
                  Plano anual
                  <ArrowRight className="size-4" />
                </PlanCheckoutLink>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/login">Já tenho acesso</Link>
              </Button>
            </div>
          </div>

          <article className="rounded-[32px] border border-white/12 bg-white/10 p-6">
            <div className="flex items-center gap-3 text-white/82">
              <ShieldCheck className="size-5" />
              <p className="text-sm font-semibold uppercase tracking-[0.16em]">Checkout seguro</p>
            </div>
            <p className="mt-5 text-2xl font-semibold tracking-[-0.05em] text-white">
              O pagamento é confirmado pelo Mercado Pago e a assinatura da conta é ativada automaticamente sem depender
              de conferência manual.
            </p>
          </article>
        </div>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-3">
        {planCards.map((plan) => {
          const isStrong = plan.tone === "strong";

          return (
            <article
              key={plan.name}
              className={
                isStrong
                  ? "surface-strong rounded-[34px] p-6 text-white"
                  : "surface rounded-[34px] p-6"
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={isStrong ? "text-sm font-semibold uppercase tracking-[0.16em] text-white/72" : "eyebrow"}>
                    {plan.label}
                  </p>
                  <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">{plan.name}</h2>
                </div>
                {isStrong ? <Sparkles className="size-5 text-white/80" /> : <CircleDollarSign className="size-5 text-[var(--color-primary)]" />}
              </div>

              <div className="mt-6">
                <p className="text-[clamp(2rem,4vw,3.2rem)] font-semibold tracking-[-0.07em]">{plan.price}</p>
                <p className={isStrong ? "text-sm text-white/72" : "text-sm text-[var(--color-muted-foreground)]"}>{plan.cadence}</p>
              </div>

              <div className="mt-6 space-y-3">
                {plan.features.map((feature) => {
                  const Icon = feature.enabled ? Check : X;
                  return (
                    <div key={feature.label} className="flex items-start gap-3 text-sm leading-6">
                      <span
                        className={
                          feature.enabled
                            ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                            : "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-muted)_70%,transparent)] text-[var(--color-muted-foreground)]"
                        }
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className={isStrong ? "text-white/84" : "text-[var(--color-ink-700)]"}>{feature.label}</span>
                    </div>
                  );
                })}
              </div>

              <Button asChild className="mt-7 w-full" variant={isStrong ? "default" : "secondary"}>
                {plan.name === "Premium Completo" ? (
                  <PlanCheckoutLink>
                    {plan.cta}
                    <ArrowRight className="size-4" />
                  </PlanCheckoutLink>
                ) : (
                  <Link href={plan.href}>
                    {plan.cta}
                    <ArrowRight className="size-4" />
                  </Link>
                )}
              </Button>
              {plan.name === "Premium Completo" && "annualCta" in plan ? (
                <Button asChild className="mt-3 w-full" variant="secondary">
                  <PlanCheckoutLink
                    hrefWhenLoggedIn="/billing?intent=checkout&cycle=annual"
                    hrefWhenLoggedOut={plan.annualHref}
                  >
                    {plan.annualCta}
                    <ArrowRight className="size-4" />
                  </PlanCheckoutLink>
                </Button>
              ) : null}
            </article>
          );
        })}
      </section>

      <section className="surface mt-6 rounded-[34px] p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="eyebrow">Comparativo direto</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em]">Permissões e limites por plano</h2>
          </div>
          <Button asChild variant="secondary">
            <PlanCheckoutLink>Criar conta e assinar mensal</PlanCheckoutLink>
          </Button>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-y-2 text-left text-sm">
            <thead>
              <tr className="text-[var(--color-muted-foreground)]">
                <th className="px-4 py-3 font-semibold">Recurso</th>
                <th className="px-4 py-3 font-semibold">Gratuito</th>
                <th className="px-4 py-3 font-semibold">Premium</th>
                <th className="px-4 py-3 font-semibold">Avaliação</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map(([feature, free, premium, trial]) => (
                <tr key={feature} className="bg-[color-mix(in_srgb,var(--color-muted)_42%,var(--color-card))]">
                  <td className="rounded-l-[18px] px-4 py-4 font-semibold text-[var(--color-foreground)]">{feature}</td>
                  <td className="px-4 py-4 text-[var(--color-ink-700)]">{free}</td>
                  <td className="px-4 py-4 text-[var(--color-ink-700)]">{premium}</td>
                  <td className="rounded-r-[18px] px-4 py-4 text-[var(--color-ink-700)]">{trial}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <article className="muted-panel">
          <LockKeyhole className="size-5 text-[var(--color-primary)]" />
          <h3 className="mt-4 text-lg font-semibold tracking-[-0.03em]">Conta necessária</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
            O checkout premium cria a conta antes do pagamento para vincular a assinatura ao titular correto.
          </p>
        </article>
        <article className="muted-panel">
          <MessageCircleMore className="size-5 text-[var(--color-primary)]" />
          <h3 className="mt-4 text-lg font-semibold tracking-[-0.03em]">WhatsApp no Premium</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
            O plano premium libera comandos financeiros pelo WhatsApp, incluindo lançamentos e consultas.
          </p>
        </article>
        <article className="muted-panel">
          <ShieldCheck className="size-5 text-[var(--color-primary)]" />
          <h3 className="mt-4 text-lg font-semibold tracking-[-0.03em]">Liberação por webhook</h3>
          <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
            A licença da conta é atualizada automaticamente após a confirmação do pagamento.
          </p>
        </article>
      </section>
    </main>
  );
}
