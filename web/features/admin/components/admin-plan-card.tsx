import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type PlanItem, formatPlanLabel } from "@/features/admin/components/admin-shared";

type AdminPlanCardProps = {
  plan: PlanItem;
  isPlatformAdmin: boolean;
  planNameDraft: string;
  planDescriptionDraft: string;
  planMaxAccountsDraft: string;
  planMaxCardsDraft: string;
  planTrialDaysDraft: string;
  onPlanNameChange: (value: string) => void;
  onPlanDescriptionChange: (value: string) => void;
  onPlanMaxAccountsChange: (value: string) => void;
  onPlanMaxCardsChange: (value: string) => void;
  onPlanTrialDaysChange: (value: string) => void;
  onSubmitPlanName: () => void;
  onSubmitPlanDescription: () => void;
  onSubmitPlanMaxAccounts: () => void;
  onSubmitPlanMaxCards: () => void;
  onSubmitPlanTrialDays: () => void;
  onToggleWhatsapp: () => void;
  onToggleAutomation: () => void;
  onTogglePdfExport: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  deleteDisabled: boolean;
};

export function AdminPlanCard({
  plan,
  isPlatformAdmin,
  planNameDraft,
  planDescriptionDraft,
  planMaxAccountsDraft,
  planMaxCardsDraft,
  planTrialDaysDraft,
  onPlanNameChange,
  onPlanDescriptionChange,
  onPlanMaxAccountsChange,
  onPlanMaxCardsChange,
  onPlanTrialDaysChange,
  onSubmitPlanName,
  onSubmitPlanDescription,
  onSubmitPlanMaxAccounts,
  onSubmitPlanMaxCards,
  onSubmitPlanTrialDays,
  onToggleWhatsapp,
  onToggleAutomation,
  onTogglePdfExport,
  onToggleActive,
  onDelete,
  deleteDisabled
}: AdminPlanCardProps) {
  return (
    <article className="data-card min-w-0 rounded-[1.6rem] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 break-words text-lg font-semibold">{plan.name}</h3>
        <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">
          {plan.isDefault ? "Padrão" : "Customizado"}
        </span>
      </div>
      <p className="mt-3 break-words text-sm leading-7 text-[var(--color-muted-foreground)]">
        {plan.description || "Sem descrição cadastrada para este plano."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--color-muted-foreground)]">
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1">{formatPlanLabel(plan.tier)}</span>
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
          {plan.trialDays > 0 ? `${plan.trialDays} dias de avaliação` : "Sem avaliação"}
        </span>
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
          {plan.tenantsCount} conta{plan.tenantsCount === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--color-muted-foreground)]">
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
          Contas {plan.maxAccounts === null ? "livres" : plan.maxAccounts}
        </span>
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
          Cartões {plan.maxCards === null ? "livres" : plan.maxCards}
        </span>
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
          {plan.features.whatsappAssistant ? "WhatsApp" : "Sem WhatsApp"}
        </span>
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
          {plan.features.automation ? "Automação" : "Sem automação"}
        </span>
        <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
          {plan.features.pdfExport ? "PDF" : "Sem PDF"}
        </span>
      </div>
      {isPlatformAdmin ? (
        <details className="admin-disclosure mt-5">
          <summary className="admin-disclosure-summary">
            <div>
              <p className="admin-disclosure-kicker">Operações</p>
              <p className="admin-disclosure-title">Ajustes do plano</p>
            </div>
            <p className="admin-disclosure-copy">Abra só quando precisar editar nome, limites, recursos ou status.</p>
          </summary>
          <div className="admin-disclosure-body">
            <div className="grid gap-3 xl:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`plan-${plan.id}-name`}>Nome</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input id={`plan-${plan.id}-name`} value={planNameDraft} onChange={(event) => onPlanNameChange(event.target.value)} />
                  <Button type="button" variant="secondary" onClick={onSubmitPlanName}>
                    Aplicar
                  </Button>
                </div>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`plan-${plan.id}-description`}>Descrição</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id={`plan-${plan.id}-description`}
                    value={planDescriptionDraft}
                    onChange={(event) => onPlanDescriptionChange(event.target.value)}
                  />
                  <Button type="button" variant="ghost" onClick={onSubmitPlanDescription}>
                    Aplicar
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`plan-${plan.id}-max-accounts`}>Limite de contas</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id={`plan-${plan.id}-max-accounts`}
                    inputMode="numeric"
                    placeholder="Livre"
                    value={planMaxAccountsDraft}
                    onChange={(event) => onPlanMaxAccountsChange(event.target.value)}
                  />
                  <Button type="button" variant="ghost" onClick={onSubmitPlanMaxAccounts}>
                    Aplicar
                  </Button>
                </div>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`plan-${plan.id}-max-cards`}>Limite de cartões</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id={`plan-${plan.id}-max-cards`}
                    inputMode="numeric"
                    placeholder="Livre"
                    value={planMaxCardsDraft}
                    onChange={(event) => onPlanMaxCardsChange(event.target.value)}
                  />
                  <Button type="button" variant="ghost" onClick={onSubmitPlanMaxCards}>
                    Aplicar
                  </Button>
                </div>
              </div>
              <div className="min-w-0 space-y-2">
                <Label htmlFor={`plan-${plan.id}-trial-days`}>Dias de avaliação</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id={`plan-${plan.id}-trial-days`}
                    inputMode="numeric"
                    value={planTrialDaysDraft}
                    onChange={(event) => onPlanTrialDaysChange(event.target.value)}
                  />
                  <Button type="button" variant="ghost" onClick={onSubmitPlanTrialDays}>
                    Aplicar
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <Button onClick={onToggleWhatsapp} type="button" variant="ghost">
                {plan.features.whatsappAssistant ? "Bloquear WhatsApp" : "Liberar WhatsApp"}
              </Button>
              <Button onClick={onToggleAutomation} type="button" variant="ghost">
                {plan.features.automation ? "Bloquear automação" : "Liberar automação"}
              </Button>
              <Button onClick={onTogglePdfExport} type="button" variant="ghost">
                {plan.features.pdfExport ? "Bloquear PDF" : "Liberar PDF"}
              </Button>
              {!plan.isDefault ? (
                <>
                  <Button onClick={onToggleActive} type="button" variant="ghost">
                    {plan.isActive ? "Desativar" : "Ativar"}
                  </Button>
                  <Button disabled={deleteDisabled} onClick={onDelete} type="button" variant="ghost">
                    Excluir
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </details>
      ) : null}
    </article>
  );
}
