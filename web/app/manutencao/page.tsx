import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function MaintenancePage() {
  return (
    <main id="main-content" className="page-shell grid min-h-screen items-center py-8">
      <section className="mx-auto grid w-full max-w-[980px] gap-4 xl:grid-cols-[0.88fr_1fr] xl:items-center">
        <div className="surface-strong hidden rounded-[30px] p-6 xl:block">
          <div className="section-stack">
            <div className="eyebrow border-white/18 bg-white/8 text-white">Modo de manutenção</div>
            <h1 className="max-w-sm text-[clamp(1.8rem,2.6vw,2.7rem)] font-semibold tracking-[-0.06em] text-white">
              A plataforma está em atualização controlada.
            </h1>
            <p className="max-w-sm text-sm leading-7 text-white/84">
              O acesso foi pausado temporariamente para proteger a consistência dos dados enquanto a equipe
              conclui ajustes operacionais.
            </p>
            <div className="grid gap-3">
              <div className="rounded-[22px] border border-white/12 bg-white/8 p-4">
                <p className="metric-label text-white/78">Estado atual</p>
                <p className="mt-2 text-base font-semibold text-white">Entradas públicas bloqueadas</p>
              </div>
              <div className="rounded-[22px] border border-white/12 bg-white/8 p-4">
                <p className="metric-label text-white/78">Rotas preservadas</p>
                <p className="mt-2 text-base font-semibold text-white">Integrações críticas continuam ativas</p>
              </div>
            </div>
          </div>
        </div>

        <div className="surface mx-auto w-full max-w-[560px] rounded-[28px] p-6 md:p-7">
          <div className="section-stack">
            <div className="eyebrow">Pausa operacional</div>
            <h2 className="section-title">Voltamos em instantes</h2>
            <p className="section-copy">
              O sistema está temporariamente indisponível para navegação normal. Assim que a manutenção for
              encerrada, o acesso ao painel será liberado automaticamente.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <article className="metric-card">
              <p className="metric-label">Objetivo</p>
              <p className="metric-value">Atualização segura</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Impacto</p>
              <p className="metric-value">Acesso temporário suspenso</p>
            </article>
          </div>

          <div className="mt-8 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-panel)]/82 p-5 text-sm leading-7 text-[var(--color-muted-foreground)]">
            Nenhuma ação é necessária da sua parte. Estamos concluindo uma atualização e o acesso será liberado assim
            que o serviço estiver pronto.
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="secondary">
              <Link href="/">Tentar novamente mais tarde</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
