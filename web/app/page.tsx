import Link from "next/link";
import { ArrowRight, BarChart3, CircleDollarSign, CreditCard, MessageCircleMore, ShieldCheck, Sparkles, Target } from "lucide-react";

import { BrandMark } from "@/components/layout/brand-mark";
import { Button } from "@/components/ui/button";

const pillars = [
  {
    title: "Leitura financeira direta",
    copy: "Saldo, faturas, contas e compromissos aparecem com hierarquia clara, sem competir com a interface.",
    icon: CircleDollarSign
  },
  {
    title: "Operação verticalizada",
    copy: "O produto conduz a rotina em blocos objetivos, com menos dispersão visual e menos cara de planilha web.",
    icon: CreditCard
  },
  {
    title: "Controle com previsibilidade",
    copy: "Relatórios, metas e vencimentos ajudam a antecipar decisões, e não apenas reagir ao mês fechado.",
    icon: Target
  },
  {
    title: "WhatsApp como atalho principal",
    copy: "Lançamentos, consultas e rotina do dia ganham velocidade com comandos naturais no canal mais usado.",
    icon: MessageCircleMore
  }
];

const highlights = ["Fluxo único para contas, cartões e metas", "Leitura objetiva para faturas e relatórios", "Comprovantes e rotina no mesmo contexto"];

const securityPillars = [
  {
    title: "Isolamento de dados",
    copy: "Cada centavo seu é isolado em nossa estrutura multi-tenant. Uma carteira nunca cruza dados com outra."
  },
  {
    title: "Criptografia",
    copy: "Senhas, sessões e fluxos de autenticação são protegidos com criptografia moderna e controles de acesso em camadas."
  },
  {
    title: "Privacidade total (LGPD)",
    copy: "Seus dados são seus. O produto opera por assinatura e não monetiza informações com corretoras, anunciantes ou revenda de perfil."
  }
];

export default function HomePage() {
  return (
    <main id="main-content" className="page-shell py-6 md:py-10">
      <section className="surface-strong overflow-hidden rounded-[42px] px-7 py-8 md:px-12 md:py-12">
        <div className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="section-stack">
            <BrandMark inverted />
            <div className="eyebrow border-white/18 bg-white/10 text-white">Save Point Finança • tema editorial</div>
            <h1 className="display-title max-w-5xl text-white">
              Controle financeiro com linguagem visual mais forte, mais noturna e mais proprietária.
            </h1>
            <p className="max-w-2xl text-base leading-8 text-white/82 md:text-lg">
              O Save Point Finança organiza contas, cartões, metas, recorrências, alertas e
              leitura mensal em uma interface mais premium, mais ritmada e mais fácil de acompanhar.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/login">
                  Entrar no sistema
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="#visao-geral">
                  Ver estrutura
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <p className="text-sm leading-7 text-white/78">
              🔒 Seus dados são criptografados de ponta a ponta e armazenados com segurança.
            </p>
          </div>

          <div className="grid gap-4 self-end">
            <article className="rounded-[32px] border border-white/12 bg-white/10 p-6">
              <p className="metric-label text-white/82">Leitura imediata</p>
              <p className="mt-4 max-w-sm text-[1.95rem] font-semibold tracking-[-0.06em] text-white">
                Saldo, compromissos e rotina financeira em uma narrativa única.
              </p>
              <div className="mt-6 grid gap-3">
                {highlights.map((item) => (
                  <div
                    key={item}
                    className="rounded-[20px] border border-white/10 bg-black/8 px-4 py-3 text-sm leading-7 text-white/84"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </article>

            <article className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[26px] border border-white/12 bg-white/9 p-5">
                <p className="metric-label text-white/76">Operação</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">Contas e cartões</p>
              </div>
              <div className="rounded-[26px] border border-white/12 bg-white/9 p-5">
                <p className="metric-label text-white/76">Acompanhamento</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">Metas e alertas</p>
              </div>
              <div className="rounded-[26px] border border-white/12 bg-white/9 p-5">
                <p className="metric-label text-white/76">Leitura</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">Relatórios mensais</p>
              </div>
              <div className="rounded-[26px] border border-white/12 bg-white/9 p-5">
                <p className="metric-label text-white/76">Canal principal</p>
                <p className="mt-3 text-2xl font-semibold tracking-[-0.05em] text-white">WhatsApp integrado</p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]" id="visao-geral">
        <article className="surface content-section">
          <div className="section-stack">
            <div className="eyebrow">Antes da operação</div>
            <h2 className="section-title">A entrada no produto agora antecipa a sensação do painel e deixa a marca mais memorável.</h2>
            <p className="section-copy">
              A estrutura foi ajustada para o que importa: marca mais forte, contraste mais rico,
              camadas suaves de movimento e leitura editorial. O foco aqui é valor percebido, não excesso de componentes.
            </p>
            <div className="editorial-rule" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="editorial-panel">
                <p className="metric-label">Marca</p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.04em] text-[var(--color-foreground)]">
                  Identidade mais proprietária e menos genérica.
                </p>
              </div>
              <div className="editorial-panel">
                <p className="metric-label">Narrativa</p>
                <p className="mt-3 text-lg font-semibold tracking-[-0.04em] text-[var(--color-foreground)]">
                  Hierarquia forte para leitura em desktop e mobile.
                </p>
              </div>
            </div>
          </div>
        </article>

        <div className="grid gap-4 md:grid-cols-3">
          {pillars.map((pillar) => {
            const Icon = pillar.icon;

            return (
              <article key={pillar.title} className="surface content-section">
                <div className="flex size-12 items-center justify-center rounded-[1.1rem] bg-[var(--color-accent)] text-[var(--color-accent-foreground)]">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-[-0.04em] text-[var(--color-foreground)]">
                  {pillar.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[var(--color-ink-700)]">{pillar.copy}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <article className="surface rounded-[38px] px-8 py-10 md:px-10 md:py-12">
          <div className="section-stack">
            <div className="eyebrow">Rotina centralizada</div>
            <h2 className="section-title">Uma experiência mais escura, mais densa e mais elegante para quem acompanha dinheiro todos os dias.</h2>
            <p className="section-copy">
              O foco agora é deixar a página de entrada mais sofisticada e mais coerente com o
              produto que existe depois do login: controle, leitura, previsibilidade, ritmo visual e um WhatsApp que
              realmente acelera a operação.
            </p>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <article className="muted-panel">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-[var(--color-primary)]" />
                <p className="font-semibold text-[var(--color-foreground)]">Acesso protegido</p>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--color-ink-700)]">
                Entrada direta no sistema com foco na operação do usuário.
              </p>
            </article>
            <article className="muted-panel">
              <div className="flex items-center gap-3">
                <BarChart3 className="size-5 text-[var(--color-primary)]" />
                <p className="font-semibold text-[var(--color-foreground)]">Leitura mensal</p>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--color-ink-700)]">
                Relatórios e faturas reunidos em leitura rápida e objetiva.
              </p>
            </article>
            <article className="muted-panel">
              <div className="flex items-center gap-3">
                <MessageCircleMore className="size-5 text-[var(--color-primary)]" />
                <p className="font-semibold text-[var(--color-foreground)]">WhatsApp em primeiro plano</p>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--color-ink-700)]">
                Registre gastos e consulte o financeiro sem sair da conversa.
              </p>
            </article>
          </div>
        </article>

        <article className="surface-strong rounded-[38px] px-8 py-10 md:px-10 md:py-12">
          <div className="section-stack">
            <div className="flex items-center gap-3 text-white/78">
              <Sparkles className="size-5" />
              <span className="text-sm font-semibold uppercase tracking-[0.18em]">Entrada no painel</span>
            </div>
            <h2 className="max-w-md text-[clamp(2rem,4vw,3.4rem)] font-semibold tracking-[-0.06em] text-white">
              Sua conta já está pronta para o uso diário.
            </h2>
            <p className="max-w-md text-base leading-8 text-white/82">
              Entre no painel para testar transações, contas, metas, relatórios e controle de acesso no
              mesmo fluxo operacional.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/login">
                  Abrir painel
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
            <p className="text-sm leading-7 text-white/78">
              🔒 Seus dados são criptografados de ponta a ponta e armazenados com segurança.
            </p>
          </div>
        </article>
      </section>

      <section className="mt-6 grid gap-4 xl:grid-cols-[0.94fr_1.06fr]">
        <article className="surface rounded-[38px] px-8 py-10 md:px-10 md:py-12">
          <div className="section-stack">
            <div className="eyebrow">Segurança de nível bancário</div>
            <h2 className="section-title">
              Segurança visível para o usuário, com rastreabilidade de acesso e privacidade por padrão.
            </h2>
            <p className="section-copy">
              O painel deixa claro quando a conta foi acessada pela última vez e mantém um histórico de segurança para eventos sensíveis de autenticação e convite.
            </p>
            <div className="editorial-rule" />
            <div className="rounded-[24px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_44%,var(--color-card))] p-5">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-[var(--color-primary)]" />
                <p className="text-sm font-semibold text-[var(--color-foreground)]">Histórico de segurança ativo</p>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--color-ink-700)]">
                O produto exibe o último acesso do usuário dentro da área autenticada para ajudar a identificar atividade fora do padrão.
              </p>
            </div>
          </div>
        </article>

        <div className="grid gap-4 md:grid-cols-3">
          {securityPillars.map((pillar) => (
            <article key={pillar.title} className="surface content-section">
              <div className="flex size-12 items-center justify-center rounded-[1.1rem] bg-[var(--color-accent)] text-[var(--color-accent-foreground)]">
                <ShieldCheck className="size-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-[-0.04em] text-[var(--color-foreground)]">
                {pillar.title}
              </h3>
              <p className="mt-3 text-sm leading-7 text-[var(--color-ink-700)]">{pillar.copy}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
