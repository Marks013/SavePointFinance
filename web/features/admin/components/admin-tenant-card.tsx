import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  type PlanItem,
  type TenantItem,
  formatBillingSubscriptionLabel,
  formatLifecycleLabel,
  formatPlanLabel
} from "@/features/admin/components/admin-shared";
import { formatDateTimeDisplay } from "@/lib/date";

type AdminTenantCardProps = {
  tenant: TenantItem;
  plans: PlanItem[];
  isPlatformAdmin: boolean;
  activeTenantBillingId: string | null;
  tenantPlanDraft: string;
  tenantTrialDraft: string;
  tenantExpiryDraft: string;
  tenantDeleteConfirmDraft: string;
  tenantTitheDraft: string;
  billingDetailsPanel?: ReactNode;
  onTenantPlanChange: (value: string) => void;
  onTenantTrialChange: (value: string) => void;
  onTenantExpiryChange: (value: string) => void;
  onTenantDeleteConfirmChange: (value: string) => void;
  onTenantTitheChange: (value: string) => void;
  onOpenBillingDetails: () => void;
  onSyncSubscription: () => void;
  onProcessQueue: () => void;
  onRecalculateTithe: () => void;
  onSyncDueSubscriptions: () => void;
  onReconcileInstallments: () => void;
  onApplyPlan: () => void;
  onApplyTrialDays: () => void;
  onApplyExpiryDate: () => void;
  onToggleActive: () => void;
  onDeleteTenant: () => void;
  billingActionDisabled: boolean;
  deleteTenantDisabled: boolean;
};

function getNextBillingLabel(tenant: TenantItem) {
  return tenant.billing.nextBillingAt ? formatDateTimeDisplay(tenant.billing.nextBillingAt) : "não exposta";
}

function getLastSyncLabel(tenant: TenantItem) {
  return tenant.billing.lastSyncedAt ? formatDateTimeDisplay(tenant.billing.lastSyncedAt) : "nunca";
}

export function AdminTenantCard({
  tenant,
  plans,
  isPlatformAdmin,
  activeTenantBillingId,
  tenantPlanDraft,
  tenantTrialDraft,
  tenantExpiryDraft,
  tenantDeleteConfirmDraft,
  tenantTitheDraft,
  billingDetailsPanel,
  onTenantPlanChange,
  onTenantTrialChange,
  onTenantExpiryChange,
  onTenantDeleteConfirmChange,
  onTenantTitheChange,
  onOpenBillingDetails,
  onSyncSubscription,
  onProcessQueue,
  onRecalculateTithe,
  onSyncDueSubscriptions,
  onReconcileInstallments,
  onApplyPlan,
  onApplyTrialDays,
  onApplyExpiryDate,
  onToggleActive,
  onDeleteTenant,
  billingActionDisabled,
  deleteTenantDisabled
}: AdminTenantCardProps) {
  return (
    <article className="data-card rounded-[1.75rem] p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <h3 className="break-words text-lg font-semibold">{tenant.name}</h3>
            <p className="break-words text-sm leading-6 text-[var(--color-muted-foreground)]">{tenant.slug}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
              {tenant.planName}
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
              {formatLifecycleLabel(tenant)}
            </span>
            <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
              {tenant.activeUsers} pessoas ativas
            </span>
          </div>
          <p className="break-words text-xs leading-5 text-[var(--color-muted-foreground)]">
            Billing: {formatBillingSubscriptionLabel(tenant.billing.subscriptionStatus)} • Próxima cobrança: {getNextBillingLabel(tenant)}
          </p>
          <p className="break-words text-xs leading-5 text-[var(--color-muted-foreground)]">Última sincronização: {getLastSyncLabel(tenant)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onOpenBillingDetails} type="button" variant="secondary">
            {activeTenantBillingId === tenant.id ? "Detalhes financeiros abertos" : "Ver pagamentos e webhooks"}
          </Button>
        </div>
      </div>

      {billingDetailsPanel}

      <details className="admin-disclosure mt-4">
        <summary className="admin-disclosure-summary">
          <div>
            <p className="admin-disclosure-kicker">Gestão da conta</p>
            <p className="admin-disclosure-title">Abrir operações e ajustes</p>
          </div>
          <p className="admin-disclosure-copy">
              Plano, ciclo, suporte financeiro e demais operações ficam sob demanda para a leitura inicial ficar mais limpa.
          </p>
        </summary>
        <div className="admin-disclosure-body space-y-4">
          <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_92%,var(--color-muted))] p-4">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Plano e ciclo</p>
                <p className="text-xs leading-5 text-[var(--color-muted-foreground)]">
                  Ajustes de plano, avaliação, expiração e ativação da conta.
                </p>
              </div>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <Select onChange={(event) => onTenantPlanChange(event.target.value)} value={tenantPlanDraft}>
                  {plans.filter((item) => item.isActive).map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} • {formatPlanLabel(plan.tier)}
                    </option>
                  ))}
                </Select>
                <Button
                  className="w-full lg:w-auto"
                  disabled={tenantPlanDraft === tenant.planId}
                  onClick={onApplyPlan}
                  type="button"
                  variant="secondary"
                >
                  Aplicar plano
                </Button>
              </div>
              <div className="grid gap-4 2xl:grid-cols-2">
                <div className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                  <div className="space-y-2">
                    <Label htmlFor={`tenant-${tenant.id}-trial-days`}>Dias de avaliação</Label>
                    <Input
                      id={`tenant-${tenant.id}-trial-days`}
                      inputMode="numeric"
                      value={tenantTrialDraft}
                      onChange={(event) => onTenantTrialChange(event.target.value)}
                    />
                    <Button className="mt-2 w-full sm:w-auto" onClick={onApplyTrialDays} type="button" variant="ghost">
                      Aplicar avaliação
                    </Button>
                  </div>
                </div>
                <div className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                  <div className="space-y-2">
                    <Label htmlFor={`tenant-${tenant.id}-expires-at`}>Expiração</Label>
                    <Input
                      id={`tenant-${tenant.id}-expires-at`}
                      placeholder="DD/MM/AAAA"
                      value={tenantExpiryDraft}
                      onChange={(event) => onTenantExpiryChange(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button className="w-full sm:w-auto" onClick={onApplyExpiryDate} type="button" variant="ghost">
                        Aplicar expiração
                      </Button>
                      <Button onClick={onToggleActive} type="button" variant="ghost">
                        {tenant.isActive ? "Desativar conta" : "Ativar conta"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <details className="admin-disclosure">
            <summary className="admin-disclosure-summary">
              <div>
                <p className="admin-disclosure-kicker">Suporte financeiro</p>
                <p className="admin-disclosure-title">Abrir ferramentas operacionais</p>
              </div>
              <p className="admin-disclosure-copy">
                Sincronizações, fila, dízimo e conciliações ficam escondidos até haver necessidade real de suporte.
              </p>
            </summary>
            <div className="admin-disclosure-body">
              <div className="muted-panel rounded-[1.2rem] p-4">
                <div className="space-y-2 text-xs text-[var(--color-muted-foreground)]">
                  <p>Próxima cobrança: {getNextBillingLabel(tenant)}</p>
                  <p>Última sincronização: {getLastSyncLabel(tenant)}</p>
                  <p>Fila pendente: {tenant.billing.queueDepth}</p>
                  <p>Falhas de webhook: {tenant.billing.failedWebhooks}</p>
                  <p>Último pagamento: {tenant.billing.latestPaymentStatus ?? "sem pagamento sincronizado"}</p>
                  <p className="break-words">Preapproval: {tenant.billing.preapprovalId ?? "não vinculado"}</p>
                  <p>Cancelamento agendado: {tenant.billing.cancelRequestedAt ?? "não"}</p>
                  <p>
                    Último reparo financeiro:{" "}
                    {tenant.billing.lastFinancialRepair
                      ? formatDateTimeDisplay(tenant.billing.lastFinancialRepair.createdAt)
                      : "nenhum reparo registrado"}
                  </p>
                  {tenant.billing.lastFinancialRepair ? (
                    <p className="leading-5">{tenant.billing.lastFinancialRepair.summary}</p>
                  ) : null}
                </div>
                {isPlatformAdmin ? (
                  <div className="mt-4 w-full max-w-[320px] space-y-2">
                    <Label htmlFor={`tenant-${tenant.id}-tithe-month-inline`}>Competência do dízimo</Label>
                    <Input
                      id={`tenant-${tenant.id}-tithe-month-inline`}
                      placeholder="2026-05"
                      value={tenantTitheDraft}
                      onChange={(event) => onTenantTitheChange(event.target.value)}
                    />
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  {isPlatformAdmin ? (
                    <>
                      <Button disabled={!tenant.billing.preapprovalId || billingActionDisabled} onClick={onSyncSubscription} type="button" variant="secondary">
                        Sincronizar billing
                      </Button>
                      <Button disabled={!tenant.billing.preapprovalId || billingActionDisabled} onClick={onProcessQueue} type="button" variant="ghost">
                        Reprocessar fila
                      </Button>
                      <Button disabled={billingActionDisabled} onClick={onRecalculateTithe} type="button" variant="ghost">
                        Recalcular dízimo
                      </Button>
                      <Button disabled={billingActionDisabled} onClick={onSyncDueSubscriptions} type="button" variant="ghost">
                        Sincronizar recorrências
                      </Button>
                      <Button disabled={billingActionDisabled} onClick={onReconcileInstallments} type="button" variant="ghost">
                        Conciliar parcelas vencidas
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </details>

          {isPlatformAdmin ? (
            <details className="admin-disclosure admin-disclosure-danger">
              <summary className="admin-disclosure-summary">
                <div>
                  <p className="admin-disclosure-kicker">Ação crítica</p>
                  <p className="admin-disclosure-title">Excluir conta e dados</p>
                </div>
                <p className="admin-disclosure-copy">
                  Deixa a remoção definitiva fora da leitura principal e exige confirmação consciente do operador.
                </p>
              </summary>
              <div className="admin-disclosure-body">
                <div className="danger-panel">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="danger-kicker">Ação crítica</p>
                      <p className="danger-copy">
                        Exclui a conta <strong>{tenant.slug}</strong> com pessoas, convites, cartões, contas financeiras, transações e demais registros relacionados.
                      </p>
                    </div>
                    <div className="w-full space-y-2 lg:w-auto">
                      <Label htmlFor={`tenant-${tenant.id}-delete-confirm`}>Confirme digitando o slug</Label>
                      <div className="flex flex-col gap-2 lg:flex-row">
                        <Input
                          id={`tenant-${tenant.id}-delete-confirm`}
                          placeholder={tenant.slug}
                          value={tenantDeleteConfirmDraft}
                          onChange={(event) => onTenantDeleteConfirmChange(event.target.value)}
                        />
                        <Button
                          className="w-full border-[var(--color-destructive)] bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)] lg:w-auto"
                          disabled={deleteTenantDisabled}
                          onClick={onDeleteTenant}
                          type="button"
                          variant="ghost"
                        >
                          Excluir conta e dados
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </details>
          ) : null}
        </div>
      </details>
    </article>
  );
}
