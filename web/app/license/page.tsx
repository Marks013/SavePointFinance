import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { BillingSummaryCard } from "@/features/billing/components/billing-summary-card";
import { getCurrentTenantAccess } from "@/lib/auth/session";

function formatDate(value: Date | null) {
  if (!value) {
    return "nao definida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(value);
}

export default async function LicensePage() {
  let access: Awaited<ReturnType<typeof getCurrentTenantAccess>>;

  try {
    access = await getCurrentTenantAccess({
      allowBlocked: true
    });
  } catch {
    redirect("/login");
  }

  if (access.isPlatformAdmin) {
    redirect("/dashboard/admin");
  }

  const canAccessApp = access.license.canAccessApp;
  const isAccountAdmin = access.role === "admin" && !access.isPlatformAdmin;

  return (
    <main id="main-content" className="page-shell">
      <section className="surface content-section mx-auto max-w-3xl py-10 sm:py-14">
        <div className="eyebrow">Licenca</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          {canAccessApp ? "Licenca e assinatura da conta" : "Acesso temporariamente indisponivel"}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          {canAccessApp ? (
            <>
              A conta <strong>{access.tenant.name}</strong> esta ativa. Revise plano, limites, recursos liberados e
              situacao da assinatura.
            </>
          ) : (
            <>
              A conta <strong>{access.tenant.name}</strong> esta com a licenca bloqueada no momento. Revise o plano,
              a ativacao da conta e a data de expiracao para voltar a operar normalmente.
            </>
          )}
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <article className="metric-card">
            <p className="metric-label">Plano</p>
            <p className="metric-value">{access.license.planLabel}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Status</p>
            <p className="metric-value">{access.license.statusLabel}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Expiracao</p>
            <p className="metric-value">{formatDate(access.tenant.expiresAt ?? access.tenant.trialExpiresAt ?? null)}</p>
          </article>
        </div>

        <div className="mt-8 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-panel)]/82 p-5 text-sm leading-7 text-[var(--color-muted-foreground)]">
          {canAccessApp ? (
            <p>
              A licenca esta ativa. Voce pode voltar ao painel ou, se for titular, gerenciar assinatura e cobranca pelo
              card abaixo.
            </p>
          ) : isAccountAdmin ? (
            <p>
              Sua avaliacao terminou ou a licenca precisa de regularizacao. Para voltar a usar as funcoes premium,
              assine o plano pelo checkout autenticado da propria conta.
            </p>
          ) : (
            <p>
              A conta precisa de regularizacao pelo administrador titular. Entre em contato com o Admin de Conta para
              renovar a assinatura.
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {!canAccessApp && isAccountAdmin ? (
            <Button asChild>
              <Link href="/billing">Assinar Premium</Link>
            </Button>
          ) : null}
          {canAccessApp ? (
            <Button asChild>
              <Link href="/dashboard/settings">Voltar para configuracoes</Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary">
            <Link href={canAccessApp ? "/dashboard" : "/login"}>{canAccessApp ? "Ir para dashboard" : "Voltar ao login"}</Link>
          </Button>
        </div>
      </section>

      <div className="mx-auto mt-6 max-w-5xl">
        <BillingSummaryCard
          compact
          profile={{
            role: access.role,
            isPlatformAdmin: access.isPlatformAdmin,
            sharing: {
              canManage: isAccountAdmin
            },
            tenant: {
              name: access.tenant.name
            },
            license: {
              plan: access.license.plan,
              planLabel: access.license.planLabel,
              status: access.license.status,
              statusLabel: access.license.statusLabel,
              features: access.license.features,
              limits: access.license.effectiveLimits
            }
          }}
        />
      </div>
    </main>
  );
}
