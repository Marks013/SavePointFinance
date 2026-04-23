import Link from "next/link";

import { BrandMark } from "@/components/layout/brand-mark";
import { PublicRegistrationForm } from "@/features/auth/components/public-registration-form";
import type { PublicRegistrationValues } from "@/features/password/schemas/password-schema";

type CadastroPageProps = {
  searchParams: Promise<{
    plan?: string;
  }>;
};

function normalizePlan(value: string | undefined): PublicRegistrationValues["plan"] {
  if (value === "trial" || value === "pro") {
    return value;
  }

  return "free";
}

export default async function CadastroPage({ searchParams }: CadastroPageProps) {
  const params = await searchParams;
  const initialPlan = normalizePlan(params.plan);

  return (
    <main id="main-content" className="page-shell grid min-h-screen items-center py-8">
      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="surface-strong rounded-[36px] p-8 md:p-10">
          <div className="section-stack">
            <BrandMark inverted compact />
            <div className="eyebrow border-white/18 bg-white/8 text-white">Cadastro</div>
            <h1 className="text-4xl font-semibold tracking-[-0.05em] text-white">
              Crie sua conta e comece pelo plano certo.
            </h1>
            <p className="max-w-lg text-base leading-8 text-white/84">
              O gratuito e a avaliação entram direto. Se escolher Premium, criamos a conta primeiro e abrimos o checkout do Mercado Pago em seguida.
            </p>
            <div className="grid gap-3 pt-4 text-sm text-white/78">
              <p>Plano gratuito: conta criada sem pagamento.</p>
              <p>Avaliação Pro: 14 dias liberados automaticamente.</p>
              <p>Premium: checkout vinculado à conta recém-criada.</p>
            </div>
          </div>
        </div>
        <section className="surface rounded-[36px] p-8 md:p-10">
          <div className="section-stack">
            <div className="eyebrow">Acesso novo</div>
            <h2 className="section-title">Começar agora</h2>
            <p className="section-copy">
              Informe os dados do titular da conta. Você entrará automaticamente no painel ou no checkout conforme o plano escolhido.
            </p>
          </div>
          <div className="mt-8">
            <PublicRegistrationForm initialPlan={initialPlan} />
          </div>
          <p className="mt-6 text-sm text-[var(--color-muted-foreground)]">
            Quer comparar de novo?{" "}
            <Link className="font-semibold text-[var(--color-primary)]" href="/planos">
              Voltar aos planos
            </Link>
          </p>
        </section>
      </section>
    </main>
  );
}
