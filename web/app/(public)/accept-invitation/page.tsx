import { AcceptInvitationForm } from "@/features/invitations/components/accept-invitation-form";
import { BrandMark } from "@/components/layout/brand-mark";
import { cookies } from "next/headers";

type AcceptInvitationPageProps = {
  searchParams: Promise<{
    token?: string;
  }>;
};

export default async function AcceptInvitationPage({ searchParams }: AcceptInvitationPageProps) {
  const params = await searchParams;
  const cookieStore = await cookies();
  const token = params.token ?? cookieStore.get("savepoint-invitation-token")?.value ?? "";

  return (
    <main id="main-content" className="page-shell grid min-h-screen items-center py-8">
      <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="surface-strong rounded-[36px] p-8 md:p-10">
          <div className="section-stack">
            <BrandMark inverted compact />
            <div className="eyebrow border-white/18 bg-white/8 text-white">Convite</div>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">Concluir acesso à sua conta compartilhada.</h1>
            <p className="max-w-lg text-base leading-8 text-white/84">
              Revise o convite, crie a sua senha e entre no painel com o perfil liberado para voce.
            </p>
          </div>
        </div>
        <section className="surface rounded-[36px] p-8 md:p-10">
          <div className="section-stack">
            <div className="eyebrow">Acesso por convite</div>
            <h2 className="section-title">Aceitar convite</h2>
            <p className="section-copy">
              Confirme os dados, defina sua senha e aceite os Termos de Uso e a Política de Privacidade para finalizar o acesso.
            </p>
          </div>
          <div className="mt-8">
            <AcceptInvitationForm initialToken={token} />
          </div>
        </section>
      </section>
    </main>
  );
}
