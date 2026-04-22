import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { BillingSummaryCard } from "@/features/billing/components/billing-summary-card";
import { CheckoutClient } from "@/features/billing/components/checkout-client";
import { getBillingCheckoutPageData } from "@/lib/billing/service";
import { isAuthError, isPermissionError } from "@/lib/observability/errors";

export default async function BillingPage() {
  let pageData: Awaited<ReturnType<typeof getBillingCheckoutPageData>>;

  try {
    pageData = await getBillingCheckoutPageData();
  } catch (error) {
    if (isAuthError(error)) {
      redirect("/login");
    }

    if (isPermissionError(error)) {
      redirect("/license");
    }

    redirect("/login");
  }

  const profile = {
    role: pageData.access.role,
    isPlatformAdmin: pageData.access.isPlatformAdmin,
    sharing: {
      canManage: pageData.access.canManageBilling
    },
    tenant: {
      name: pageData.access.tenant.name
    },
    license: {
      plan: pageData.access.license.plan,
      planLabel: pageData.access.license.planLabel,
      status: pageData.access.license.status,
      statusLabel: pageData.access.license.statusLabel,
      features: pageData.access.license.features,
      limits: pageData.access.license.effectiveLimits
    }
  } as const;

  return (
    <main id="main-content" className="page-shell">
      <div className="mx-auto max-w-5xl space-y-6 py-10 sm:py-14">
        <section className="surface content-section">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="eyebrow">Mercado Pago</div>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">Checkout e gestão da assinatura</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
                Este fluxo mantém o pagamento dentro do seu domínio, sincroniza a liberação via webhook e conversa
                direto com a licença da conta.
              </p>
            </div>
            <Button asChild variant="secondary">
              <Link href={pageData.access.license.canAccessApp ? "/dashboard/settings" : "/license"}>Voltar</Link>
            </Button>
          </div>
        </section>

        <BillingSummaryCard compact profile={profile} />

        <CheckoutClient
          amount={pageData.amount}
          currencyId={pageData.currencyId}
          planName={pageData.planName}
          publicKey={pageData.publicKey}
        />
      </div>
    </main>
  );
}
