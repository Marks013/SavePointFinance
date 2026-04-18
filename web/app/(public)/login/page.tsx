import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentTenantAccess } from "@/lib/auth/session";
import { BrandMark } from "@/components/layout/brand-mark";

export default async function LoginPage() {
  try {
    const access = await getCurrentTenantAccess({
      allowBlocked: true
    });

    if (!access.license.canAccessApp) {
      redirect(`/license?reason=${access.blockedReason ?? "expired"}`);
    }

    redirect("/dashboard");
  } catch {
    // Session is absent or invalid; keep the login page public.
  }

  return (
    <main id="main-content" className="page-shell grid min-h-screen items-center py-8">
      <section className="mx-auto grid w-full max-w-[980px] gap-4 xl:grid-cols-[0.82fr_1fr] xl:items-center">
        <div className="surface-strong hidden rounded-[30px] p-6 xl:block">
          <div className="section-stack">
            <BrandMark inverted />
            <div className="brand-divider opacity-40" />
            <div className="eyebrow border-white/18 bg-white/8 text-white">Acesso seguro</div>
            <h1 className="max-w-sm text-[clamp(1.8rem,2.6vw,2.7rem)] font-semibold tracking-[-0.06em] text-white">
              Seu financeiro com presenca visual, contexto e ordem.
            </h1>
            <p className="max-w-sm text-sm leading-7 text-white/84">
              O objetivo aqui nao e apenas entrar no sistema, e sentir que voce esta acessando um
              produto financeiro premium, organizado para uso serio.
            </p>
            <div className="grid gap-3">
              <div className="rounded-[22px] border border-white/12 bg-white/8 p-4">
                <p className="metric-label text-white/78">Visao consolidada</p>
                <p className="mt-2 text-base font-semibold text-white">Receitas, despesas e faturas</p>
              </div>
              <div className="rounded-[22px] border border-white/12 bg-white/8 p-4">
                <p className="metric-label text-white/78">Rotina organizada</p>
                <p className="mt-2 text-base font-semibold text-white">Metas, rotina financeira e alertas</p>
              </div>
              <div className="rounded-[22px] border border-white/12 bg-white/8 p-4">
                <p className="metric-label text-white/78">Canal protagonista</p>
                <p className="mt-2 text-base font-semibold text-white">WhatsApp para lançar e consultar</p>
              </div>
            </div>
          </div>
        </div>

        <div className="surface mx-auto w-full max-w-[540px] rounded-[28px] p-6 md:p-7">
          <div className="section-stack">
            <BrandMark className="xl:hidden" compact />
            <div className="eyebrow">Acesso seguro</div>
            <h2 className="section-title">Entrar no painel</h2>
            <p className="section-copy">
              Use o e-mail da sua conta e a sua senha para continuar. Depois, você pode operar pelo painel ou acelerar
              a rotina pelo WhatsApp.
            </p>
          </div>
          <LoginForm />
          <div className="mt-6 text-center text-sm text-[var(--color-muted-foreground)]">
            <a href="/forgot-password">Esqueci minha senha</a>
          </div>
        </div>
      </section>
    </main>
  );
}
