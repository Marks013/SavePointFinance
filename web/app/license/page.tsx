import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
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
          <p>
            Se você for o administrador, abra a área administrativa da conta e revise a ativação, o plano e a data
            de expiração. Se não for o administrador, entre em contato com o titular da conta.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/login">Voltar ao login</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
