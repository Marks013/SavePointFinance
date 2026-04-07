import { ResetPasswordForm } from "@/features/password/components/reset-password-form";
import { BrandMark } from "@/components/layout/brand-mark";

type ResetPasswordPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;

  return (
    <main id="main-content" className="page-shell grid min-h-screen items-center py-8">
      <section className="section-stack">
        <div className="surface-strong rounded-[36px] p-8 md:p-10">
          <div className="section-stack">
            <BrandMark inverted compact />
            <div className="eyebrow border-white/18 bg-white/8 text-white">Nova senha</div>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">Defina uma nova senha para a sua conta.</h1>
            <p className="max-w-lg text-base leading-8 text-white/84">
              Use o token de recuperacao recebido e finalize o processo com uma senha nova.
            </p>
          </div>
        </div>
        <section className="surface rounded-[36px] p-8 md:p-10 md:max-w-[760px]">
          <div className="section-stack">
            <div className="eyebrow">Redefinicao</div>
            <h2 className="section-title">Redefinir senha</h2>
            <p className="section-copy">
              Informe o token de recuperacao e escolha a nova senha.
            </p>
          </div>
          <div className="mt-8">
            <ResetPasswordForm initialToken={params.token ?? ""} />
          </div>
        </section>
      </section>
    </main>
  );
}
