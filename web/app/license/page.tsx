import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { BillingSummaryCard } from "@/features/billing/components/billing-summary-card";
import { getCurrentTenantAccess } from "@/lib/auth/session";

function formatDate(value: Date | null) {
  if (!value) {
    return "não definida";
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

  if (access.license.canAccessApp) {
    redirect("/dashboard");
  }

  return (
    <main id="main-content" className="page-shell">
      <section className="surface content-section mx-auto max-w-3xl py-10 sm:py-14">
        <div className="eyebrow">Licença</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Acesso temporariamente indisponível</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          A conta <strong>{access.tenant.name}</strong> está com a licença bloqueada no momento. Revise o plano,
          a ativação da conta e a data de expiração para voltar a operar normalmente.
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
            <p className="metric-label">Expiração</p>
            <p className="metric-value">
              {formatDate(access.tenant.expiresAt ?? access.tenant.trialExpiresAt ?? null)}
            </p>
          </article>
        </div>

        <div className="mt-8 rounded-[28px] border border-[var(--color-border)] bg-[var(--color-panel)]/82 p-5 text-sm leading-7 text-[var(--color-muted-foreground)]">
          {access.role === "admin" && !access.isPlatformAdmin ? (
            <p>
              Sua avaliação terminou ou a licença precisa de regularização. Para voltar a usar as funções premium,
              assine o plano pelo checkout autenticado da própria conta.
            </p>
          ) : (
            <p>
              A conta precisa de regularização pelo administrador titular. Entre em contato com o Admin de Conta para
              renovar a assinatura.
            </p>
          )}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          {access.role === "admin" && !access.isPlatformAdmin ? (
            <Button asChild>
              <Link href="/billing">Assinar Premium</Link>
            </Button>
          ) : null}
          <Button asChild variant="secondary">
            <Link href="/login">Voltar ao login</Link>
          </Button>
        </div>
      </section>

      <div className="mx-auto mt-6 max-w-5xl">
        <BillingSummaryCard
          compact
          profile={{
            role: access.role,
            isPlatformAdmin: access.isPlatformAdmin,
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
