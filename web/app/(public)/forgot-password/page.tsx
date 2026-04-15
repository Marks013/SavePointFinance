import { ForgotPasswordForm } from "@/features/password/components/forgot-password-form";
import { BrandMark } from "@/components/layout/brand-mark";

export default function ForgotPasswordPage() {
  return (
    <main id="main-content" className="page-shell grid min-h-screen items-center py-8">
      <section className="section-stack">
        <div className="surface-strong rounded-[36px] p-8 md:p-10">
          <div className="section-stack">
            <BrandMark inverted compact />
            <div className="eyebrow border-white/18 bg-white/8 text-white">Recuperacao</div>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">Recuperar acesso com seguranca.</h1>
            <p className="max-w-lg text-base leading-8 text-white/84">
              Informe o e-mail cadastrado para iniciar a redefinicao de senha e retomar o acesso ao painel.
            </p>
          </div>
        </div>
        <section className="surface rounded-[36px] p-8 md:p-10 md:max-w-[760px]">
          <div className="section-stack">
            <div className="eyebrow">Fluxo seguro</div>
            <h2 className="section-title">Recuperar acesso</h2>
            <p className="section-copy">
              Envie a solicitacao com o seu e-mail para continuar.
            </p>
          </div>
          <div className="mt-8">
            <ForgotPasswordForm />
          </div>
        </section>
      </section>
    </main>
  );
}
