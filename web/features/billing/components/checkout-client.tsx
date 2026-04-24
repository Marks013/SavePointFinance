"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ensureApiResponse } from "@/lib/observability/http";

type CheckoutClientProps = {
  amount: number | null;
  currencyId: string;
  planName: string;
  publicKey: string | null;
};

type CreateSubscriptionPayload = {
  url?: string | null;
  message?: string;
};

type CardPaymentFormData = {
  token?: string;
  payment_method_id?: string;
  issuer_id?: string;
  installments?: number | null;
  payer?: unknown;
};

type CardPaymentAdditionalData = {
  bin?: string;
  lastFourDigits?: string;
  cardholderName?: string;
  paymentTypeId?: string;
};

async function createSubscription(body: Record<string, unknown>) {
  const response = await fetch("/api/billing/checkout/create-subscription", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao criar assinatura",
    method: "POST",
    path: "/api/billing/checkout/create-subscription"
  });

  return (await response.json()) as CreateSubscriptionPayload;
}

export function CheckoutClient({ amount, currencyId, planName, publicKey }: CheckoutClientProps) {
  const queryClient = useQueryClient();
  const [isBrickReady, setIsBrickReady] = useState(false);
  const [brickError, setBrickError] = useState<string | null>(null);
  const [brickDiagnostic, setBrickDiagnostic] = useState<string | null>(null);
  const createSubscriptionMutation = useMutation({
    mutationFn: createSubscription,
    onSuccess: async (payload) => {
      toast.success(payload.message ?? "Assinatura criada com sucesso");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["billing"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] })
      ]);

      window.location.href = payload.url ?? "/license";
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  useEffect(() => {
    if (!publicKey) {
      return;
    }

    setIsBrickReady(false);
    setBrickError(null);
    setBrickDiagnostic(null);
    initMercadoPago(publicKey, {
      locale: "pt-BR"
    });
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey || typeof amount !== "number" || amount <= 0 || isBrickReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      const container = document.getElementById("savepoint-card-payment-brick");
      const childCount = container?.childElementCount ?? 0;

      if (childCount > 0) {
        setIsBrickReady(true);
        setBrickDiagnostic(null);
        return;
      }

      setBrickDiagnostic("O SDK do Mercado Pago carregou, mas ainda nao inseriu os campos no container.");
    }, 6000);

    return () => window.clearTimeout(timer);
  }, [amount, isBrickReady, publicKey]);

  const cardPaymentInitialization = useMemo(
    () => ({
      amount: amount ?? 0
    }),
    [amount]
  );

  const handleBrickReady = useCallback(() => {
    setIsBrickReady(true);
    setBrickError(null);
  }, []);

  const handleBrickError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : "Falha ao carregar o checkout do Mercado Pago";
    setBrickError(message);
    toast.error(message);
  }, []);

  const handleSubmit = useCallback(
    async (formData: CardPaymentFormData, additionalData?: CardPaymentAdditionalData) => {
      await createSubscriptionMutation.mutateAsync({
        cardToken: formData.token,
        paymentMethodId: formData.payment_method_id,
        issuerId: formData.issuer_id || null,
        installments: formData.installments ?? null,
        payer: formData.payer ?? null,
        metadata: {
          bin: additionalData?.bin ?? null,
          lastFourDigits: additionalData?.lastFourDigits ?? null,
          cardholderName: additionalData?.cardholderName ?? null,
          paymentTypeId: additionalData?.paymentTypeId ?? null
        }
      });
    },
    [createSubscriptionMutation.mutateAsync]
  );

  if (!publicKey || typeof amount !== "number" || amount <= 0) {
    return (
      <section className="surface content-section">
        <div className="eyebrow">Checkout</div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Billing ainda não está pronto</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          O ambiente precisa expor chave pública e valor da recorrência para liberar o Brick do Mercado Pago.
        </p>
      </section>
    );
  }

  return (
    <section className="surface content-section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Checkout</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">{planName}</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
            O cartão é tokenizado pelo Brick do Mercado Pago e a assinatura recorrente é criada no backend com
            idempotência, webhook e sincronização automática da licença.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href="/license">Voltar para licença</Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="metric-card">
          <p className="metric-label">Plano</p>
          <p className="metric-value">{planName}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Valor</p>
          <p className="metric-value">
            {new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: currencyId
            }).format(amount)}
          </p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Cobrança</p>
          <p className="metric-value">Recorrente</p>
        </article>
      </div>

      <div className="data-card mt-6 p-5">
        {!isBrickReady ? (
          <div className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-muted-foreground)]">
            Carregando campos seguros do Mercado Pago...
          </div>
        ) : null}
        {brickError ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{brickError}</div>
        ) : null}
        {brickDiagnostic ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {brickDiagnostic}
          </div>
        ) : null}
        <div className="min-h-[520px]">
        <CardPayment
          id="savepoint-card-payment-brick"
          initialization={cardPaymentInitialization}
          locale="pt-BR"
          onError={handleBrickError}
          onReady={handleBrickReady}
          onSubmit={handleSubmit}
        />
        </div>
      </div>

      {createSubscriptionMutation.isPending ? (
        <div className="muted-panel mt-5 text-sm text-[var(--color-muted-foreground)]">
          Criando assinatura e sincronizando a licença da conta...
        </div>
      ) : null}
    </section>
  );
}
