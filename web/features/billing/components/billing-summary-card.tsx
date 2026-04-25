"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  cancelBillingSubscription,
  getBillingOverview,
  startBillingCheckout
} from "@/features/billing/lib/billing-api";
import type { BillingProfileSnapshot } from "@/features/billing/types";
import { formatDateDisplay } from "@/lib/date";
import { Button } from "@/components/ui/button";

type BillingSummaryCardProps = {
  profile: BillingProfileSnapshot;
  compact?: boolean;
};

function formatLimitValue(value: number | null) {
  return value === null ? "Ilimitado" : String(value);
}

function resolveLifecycleCopy(
  status: string,
  currentPeriodEnd: string | null,
  trialEndsAt: string | null,
  canceledAt: string | null
) {
  if (status === "trial" && trialEndsAt) {
    return `Avaliação até ${formatDateDisplay(trialEndsAt)}`;
  }

  if (currentPeriodEnd) {
    return `Ciclo atual até ${formatDateDisplay(currentPeriodEnd)}`;
  }

  if (canceledAt) {
    return `Cancelada em ${formatDateDisplay(canceledAt)}`;
  }

  return "Sem data de renovação informada";
}

export function BillingSummaryCard({ profile, compact = false }: BillingSummaryCardProps) {
  const queryClient = useQueryClient();
  const billingQuery = useQuery({
    queryKey: ["billing"],
    queryFn: () => getBillingOverview(profile),
    staleTime: 30_000
  });
  const overview = billingQuery.data;

  const checkoutMutation = useMutation({
    mutationFn: startBillingCheckout,
    onSuccess: (payload) => {
      if (payload.url) {
        window.location.href = payload.url;
        return;
      }

      toast.success(payload.message ?? "Checkout iniciado");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const cancelMutation = useMutation({
    mutationFn: cancelBillingSubscription,
    onSuccess: async (payload) => {
      toast.success(payload.message ?? "Cancelamento agendado");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["billing"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] })
      ]);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  if (!overview) {
    return (
      <section className="surface content-section">
        <div className="eyebrow">Assinatura</div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Plano e assinatura</h2>
        <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">Carregando status do plano...</p>
      </section>
    );
  }

  const canManageBilling = overview.permissions.canManageBilling;
  const subscriptionStatusCopy = resolveLifecycleCopy(
    overview.subscription.status,
    overview.subscription.currentPeriodEnd,
    overview.subscription.trialEndsAt,
    overview.subscription.canceledAt
  );

  return (
    <section className="surface content-section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Assinatura</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Plano e assinatura</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
            Veja o status atual do plano da conta, acompanhe renovação e acione checkout, gerenciamento ou cancelamento
            sem sair da área de configurações.
          </p>
        </div>
        {!compact ? (
          <Button asChild variant="secondary">
            <Link href="/license">Ver tela de licença</Link>
          </Button>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <article className="metric-card">
          <p className="metric-label">Plano atual</p>
          <p className="metric-value">{overview.plan.name}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Status</p>
          <p className="metric-value">{overview.subscription.statusLabel}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Contas / cartões</p>
          <p className="metric-value">
            {formatLimitValue(overview.plan.limits.accounts)} / {formatLimitValue(overview.plan.limits.cards)}
          </p>
        </article>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="data-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Situação da assinatura</p>
              <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">{subscriptionStatusCopy}</p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
                {overview.subscription.subscribed ? "Assinatura ativa" : "Sem assinatura ativa"}
              </span>
              {overview.subscription.cancelAtPeriodEnd ? (
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
                  Cancelamento agendado
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="muted-panel">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Usuários</p>
              <p className="mt-2 text-sm">{formatLimitValue(overview.plan.limits.users)}</p>
            </div>
            <div className="muted-panel">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Contas</p>
              <p className="mt-2 text-sm">{formatLimitValue(overview.plan.limits.accounts)}</p>
            </div>
            <div className="muted-panel">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Cartões</p>
              <p className="mt-2 text-sm">{formatLimitValue(overview.plan.limits.cards)}</p>
            </div>
          </div>

          {overview.subscription.cancelAtPeriodEnd ? (
            <div className="warning-panel mt-5 text-sm">
              A assinatura está marcada para encerrar no fim do ciclo atual. Os recursos premium seguem ativos até a
              data final informada.
            </div>
          ) : null}
        </article>

        <article className="data-card p-5">
          <p className="text-sm font-semibold">Recursos do plano</p>
          <div className="mt-4 space-y-3 text-sm text-[var(--color-muted-foreground)]">
            <p>{overview.plan.features.whatsappAssistant ? "WhatsApp liberado" : "WhatsApp indisponível"}</p>
            <p>{overview.plan.features.automation ? "Automações recorrentes liberadas" : "Automações indisponíveis"}</p>
            <p>{overview.plan.features.pdfExport ? "Exportação PDF liberada" : "Exportação PDF indisponível"}</p>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {canManageBilling && overview.subscription.canCheckout ? (
              <Button disabled={checkoutMutation.isPending} onClick={() => checkoutMutation.mutate()} type="button">
                {checkoutMutation.isPending ? "Abrindo checkout..." : "Fazer upgrade"}
              </Button>
            ) : null}
            {canManageBilling && overview.subscription.canUpdateCard ? (
              <Button asChild variant="secondary">
                <Link href="/billing?intent=manage-card">Trocar cartao de cobranca</Link>
              </Button>
            ) : null}
            {canManageBilling && overview.subscription.canManage ? (
              <Button asChild variant="secondary">
                <Link href="/billing">Central de gestao do plano</Link>
              </Button>
            ) : null}
            {canManageBilling && overview.subscription.canCancel ? (
              <Button
                className="border-[var(--color-destructive)] text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)]"
                disabled={cancelMutation.isPending}
                onClick={() => {
                  const confirmed = window.confirm(
                    "Deseja cancelar a assinatura? Se estiver dentro de 7 dias da primeira assinatura, o valor sera estornado integralmente e a conta voltara imediatamente ao plano Gratuito."
                  );

                  if (!confirmed) {
                    return;
                  }

                  cancelMutation.mutate();
                }}
                type="button"
                variant="ghost"
              >
                {cancelMutation.isPending ? "Cancelando..." : "Cancelar assinatura"}
              </Button>
            ) : null}
          </div>

          {!canManageBilling ? (
            <div className="muted-panel mt-5 text-sm text-[var(--color-muted-foreground)]">
              Apenas o <strong>Admin de Conta</strong> pode iniciar checkout, gerenciar cobrança ou cancelar a assinatura.
            </div>
          ) : null}
          {overview.permissions.isPlatformAdmin ? (
            <div className="muted-panel mt-5 text-sm text-[var(--color-muted-foreground)]">
              O superadmin da plataforma visualiza o status da assinatura, mas não deve cancelar a licença por este fluxo.
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}
