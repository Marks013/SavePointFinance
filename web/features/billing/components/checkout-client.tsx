"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CardPayment, initMercadoPago } from "@mercadopago/sdk-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureApiResponse } from "@/lib/observability/http";

type CheckoutPromotion = {
  id: string;
  title: string;
  badge: string;
  description: string;
  couponCode: string;
  discountPercent: number;
  appliesTo: "monthly" | "annual" | "both";
};

type CheckoutClientProps = {
  amount: number | null;
  annualAmount: number | null;
  annualMaxInstallments: number;
  currencyId: string;
  planName: string;
  promotions: CheckoutPromotion[];
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

async function createAnnualPayment(body: Record<string, unknown>) {
  const response = await fetch("/api/billing/checkout/create-annual-payment", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao criar checkout anual",
    method: "POST",
    path: "/api/billing/checkout/create-annual-payment"
  });

  return (await response.json()) as CreateSubscriptionPayload;
}

function formatMoney(amount: number, currencyId: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currencyId
  }).format(amount);
}

export function CheckoutClient({
  amount,
  annualAmount,
  annualMaxInstallments,
  currencyId,
  planName,
  promotions,
  publicKey
}: CheckoutClientProps) {
  const queryClient = useQueryClient();
  const [isBrickReady, setIsBrickReady] = useState(false);
  const [brickError, setBrickError] = useState<string | null>(null);
  const [brickDiagnostic, setBrickDiagnostic] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const activeCoupon = couponCode.trim().toUpperCase();
  const matchingPromotion = useMemo(
    () =>
      activeCoupon
        ? promotions.find((promotion) => promotion.couponCode.trim().toUpperCase() === activeCoupon) ?? null
        : null,
    [activeCoupon, promotions]
  );
  const monthlyPromotion =
    matchingPromotion && (matchingPromotion.appliesTo === "monthly" || matchingPromotion.appliesTo === "both")
      ? matchingPromotion
      : null;
  const annualPromotion =
    matchingPromotion && (matchingPromotion.appliesTo === "annual" || matchingPromotion.appliesTo === "both")
      ? matchingPromotion
      : null;
  const monthlyCheckoutAmount =
    typeof amount === "number" && monthlyPromotion
      ? Number(Math.max(amount - amount * (monthlyPromotion.discountPercent / 100), 0.01).toFixed(2))
      : amount;
  const annualCheckoutAmount =
    typeof annualAmount === "number" && annualPromotion
      ? Number(Math.max(annualAmount - annualAmount * (annualPromotion.discountPercent / 100), 0.01).toFixed(2))
      : annualAmount;
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
  const createAnnualPaymentMutation = useMutation({
    mutationFn: createAnnualPayment,
    onSuccess: (payload) => {
      toast.success(payload.message ?? "Checkout anual iniciado");

      if (payload.url) {
        window.location.href = payload.url;
      }
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  useEffect(() => {
    if (!publicKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsBrickReady(false);
      setBrickError(null);
      setBrickDiagnostic(null);
      initMercadoPago(publicKey, {
        locale: "pt-BR"
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey || typeof monthlyCheckoutAmount !== "number" || monthlyCheckoutAmount <= 0 || isBrickReady) {
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
  }, [isBrickReady, monthlyCheckoutAmount, publicKey]);

  const cardPaymentInitialization = useMemo(
    () => ({
      amount: monthlyCheckoutAmount ?? 0
    }),
    [monthlyCheckoutAmount]
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

  const handleSubmit = async (formData: CardPaymentFormData, additionalData?: CardPaymentAdditionalData) => {
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
      },
      couponCode: activeCoupon || null
    });
  };

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
          <p className="metric-value">{formatMoney(monthlyCheckoutAmount ?? amount, currencyId)}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Cobrança</p>
          <p className="metric-value">Mensal ou anual</p>
        </article>
      </div>

      <div className="data-card mt-6 p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.65fr] lg:items-end">
          <div>
            <p className="text-sm font-semibold">Cupom de desconto</p>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Digite um cupom ou escolha uma promoção ativa. O desconto é validado novamente no backend antes de criar
              o pagamento.
            </p>
          </div>
          <Input
            aria-label="Cupom de desconto"
            onChange={(event) => setCouponCode(event.target.value)}
            placeholder="BLACKFRIDAY"
            value={couponCode}
          />
        </div>
        {promotions.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {promotions.map((promotion) => (
              <button
                className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] p-4 text-left transition hover:border-[var(--color-primary)]"
                key={promotion.id}
                onClick={() => setCouponCode(promotion.couponCode)}
                type="button"
              >
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
                  {promotion.badge}
                </span>
                <span className="mt-2 block text-sm font-semibold text-[var(--color-foreground)]">
                  {promotion.title} • {promotion.discountPercent}% off
                </span>
                <span className="mt-1 block text-xs leading-5 text-[var(--color-muted-foreground)]">
                  {promotion.description || `Cupom ${promotion.couponCode}`}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {activeCoupon && !matchingPromotion ? (
          <div className="warning-panel mt-4 text-sm">Cupom não encontrado ou indisponível para estes planos.</div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className="data-card p-5">
          <p className="text-sm font-semibold">Mensal recorrente</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
            {formatMoney(monthlyCheckoutAmount ?? amount, currencyId)}
          </p>
          {monthlyPromotion && typeof amount === "number" ? (
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              Antes {formatMoney(amount, currencyId)} com cupom {monthlyPromotion.couponCode}.
            </p>
          ) : null}
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted-foreground)]">
            Cobrança automática mensal por cartão de crédito. Ideal para começar pagando menos agora.
          </p>
        </article>

        <article className="data-card p-5">
          <p className="text-sm font-semibold">Anual sem renovação automática</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
            {typeof annualCheckoutAmount === "number" && annualCheckoutAmount > 0
              ? formatMoney(annualCheckoutAmount, currencyId)
              : "Indisponível"}
          </p>
          {annualPromotion && typeof annualAmount === "number" ? (
            <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
              Antes {formatMoney(annualAmount, currencyId)} com cupom {annualPromotion.couponCode}.
            </p>
          ) : null}
          <p className="mt-3 text-sm leading-7 text-[var(--color-muted-foreground)]">
            Pagamento único para 12 meses de acesso premium, com Pix, boleto, saldo Mercado Pago ou cartão parcelado
            conforme disponibilidade do Mercado Pago.
          </p>
          <Button
            className="mt-5 w-full"
            disabled={createAnnualPaymentMutation.isPending || typeof annualCheckoutAmount !== "number" || annualCheckoutAmount <= 0}
            onClick={() => createAnnualPaymentMutation.mutate({ couponCode: activeCoupon || null })}
            type="button"
            variant="secondary"
          >
            {createAnnualPaymentMutation.isPending
              ? "Abrindo checkout anual..."
              : `Pagar anual${annualMaxInstallments > 1 ? ` em ate ${annualMaxInstallments}x` : ""}`}
          </Button>
        </article>
      </div>

      <div className="data-card mt-6 p-5">
        <div className="mb-5">
          <p className="text-sm font-semibold">Assinar mensal com cartão</p>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
            Use este formulário apenas para a assinatura mensal recorrente.
          </p>
        </div>
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
      {createAnnualPaymentMutation.isPending ? (
        <div className="muted-panel mt-5 text-sm text-[var(--color-muted-foreground)]">
          Criando checkout anual no Mercado Pago...
        </div>
      ) : null}
    </section>
  );
}
