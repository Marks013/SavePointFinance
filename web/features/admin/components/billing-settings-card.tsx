"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type BillingPromotionDraft = {
  id: string;
  title: string;
  badge: string;
  description: string;
  couponCode: string;
  discountPercent: number;
  appliesTo: "monthly" | "annual" | "both";
  visibleInCheckout: boolean;
  highlightPriceCard: boolean;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

type BillingSettingsDraft = {
  monthlyAmount: number;
  annualAmount: number;
  annualMaxInstallments: number;
  currencyId: string;
  promotions: BillingPromotionDraft[];
};

async function getBillingSettings() {
  const response = await fetch("/api/admin/billing-settings", { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Falha ao carregar configurações comerciais");
  }

  return (await response.json()) as { settings: BillingSettingsDraft };
}

async function updateBillingSettings(settings: BillingSettingsDraft) {
  const response = await fetch("/api/admin/billing-settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings)
  });
  const payload = (await response.json().catch(() => ({}))) as { message?: string; settings?: BillingSettingsDraft };

  if (!response.ok) {
    throw new Error(payload.message ?? "Falha ao salvar configurações comerciais");
  }

  return payload;
}

function makePromotionDraft(): BillingPromotionDraft {
  const id = `promo-${Date.now().toString(36)}`;

  return {
    id,
    title: "Nova promoção",
    badge: "Promoção",
    description: "",
    couponCode: "",
    discountPercent: 10,
    appliesTo: "annual",
    visibleInCheckout: true,
    highlightPriceCard: false,
    enabled: false,
    startsAt: null,
    endsAt: null
  };
}

function formatMoney(value: number, currencyId: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currencyId
  }).format(value || 0);
}

function serializeBillingSettings(settings: BillingSettingsDraft) {
  return JSON.stringify({
    monthlyAmount: Number(settings.monthlyAmount),
    annualAmount: Number(settings.annualAmount),
    annualMaxInstallments: Number(settings.annualMaxInstallments),
    currencyId: settings.currencyId,
    promotions: settings.promotions.map((promotion) => ({
      id: promotion.id,
      title: promotion.title.trim(),
      badge: promotion.badge.trim(),
      description: promotion.description.trim(),
      couponCode: promotion.couponCode.trim().toUpperCase(),
      discountPercent: Number(promotion.discountPercent),
      appliesTo: promotion.appliesTo,
      visibleInCheckout: Boolean(promotion.visibleInCheckout),
      highlightPriceCard: Boolean(promotion.highlightPriceCard),
      enabled: Boolean(promotion.enabled),
      startsAt: promotion.startsAt || null,
      endsAt: promotion.endsAt || null
    }))
  });
}

export function BillingSettingsCard() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["admin-billing-settings"],
    queryFn: getBillingSettings
  });
  const [draft, setDraft] = useState<BillingSettingsDraft | null>(null);
  const updateMutation = useMutation({
    mutationFn: updateBillingSettings,
    onSuccess: async (payload) => {
      if (payload.settings) {
        setDraft(payload.settings);
      }
      toast.success(payload.message ?? "Configurações comerciais salvas");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-billing-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
    },
    onError: (error) => toast.error(error.message)
  });

  useEffect(() => {
    if (settingsQuery.data?.settings) {
      const timer = window.setTimeout(() => setDraft(settingsQuery.data.settings), 0);
      return () => window.clearTimeout(timer);
    }
  }, [settingsQuery.data]);

  if (settingsQuery.isLoading || !draft) {
    return (
      <section className="surface content-section">
        <div className="eyebrow">Billing comercial</div>
        <p className="mt-3 text-sm text-[var(--color-muted-foreground)]">Carregando preços e promoções...</p>
      </section>
    );
  }
  const hasBillingChanges = serializeBillingSettings(draft) !== serializeBillingSettings(settingsQuery.data?.settings ?? draft);

  return (
    <section className="surface content-section">
      <div className="admin-section-header">
        <div className="min-w-0 flex-1">
          <div className="eyebrow">Billing comercial</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Preços, cupons e promoções</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
            Ajuste valores, cupons visiveis e cupons secretos que funcionam somente quando o cliente digita o codigo.
          </p>
        </div>
        <article className="metric-card admin-section-metric">
          <p className="metric-label">Anual</p>
          <p className="metric-value">{formatMoney(draft.annualAmount, draft.currencyId)}</p>
        </article>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="billing-monthly-amount">Mensal recorrente</Label>
          <Input
            id="billing-monthly-amount"
            inputMode="decimal"
            onChange={(event) => setDraft({ ...draft, monthlyAmount: Number(event.target.value.replace(",", ".")) })}
            value={draft.monthlyAmount}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="billing-annual-amount">Anual à vista/parcelado</Label>
          <Input
            id="billing-annual-amount"
            inputMode="decimal"
            onChange={(event) => setDraft({ ...draft, annualAmount: Number(event.target.value.replace(",", ".")) })}
            value={draft.annualAmount}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="billing-installments">Parcelas anuais máximas</Label>
          <Input
            id="billing-installments"
            inputMode="numeric"
            onChange={(event) => setDraft({ ...draft, annualMaxInstallments: Number(event.target.value) })}
            value={draft.annualMaxInstallments}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="billing-currency">Moeda</Label>
          <Input
            id="billing-currency"
            maxLength={3}
            onChange={(event) => setDraft({ ...draft, currencyId: event.target.value.toUpperCase() })}
            value={draft.currencyId}
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Cards promocionais e cupons</p>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            Promoções ativas aparecem no checkout como cards clicáveis e também funcionam por campo de cupom. As datas
            de início e fim são opcionais; deixe vazias para o cupom valer enquanto estiver ativo.
          </p>
        </div>
        <Button
          onClick={() => setDraft({ ...draft, promotions: [...draft.promotions, makePromotionDraft()] })}
          type="button"
          variant="secondary"
        >
          <Plus className="size-4" />
          Nova promoção
        </Button>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {draft.promotions.map((promotion, index) => (
          <article className="data-card p-4" key={promotion.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{promotion.title}</p>
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                  {promotion.enabled
                    ? promotion.visibleInCheckout
                      ? "Ativa e visivel no checkout"
                      : "Ativa como cupom secreto"
                    : "Desativada"}
                </p>
              </div>
              <Button
                aria-label="Remover promoção"
                onClick={() =>
                  setDraft({
                    ...draft,
                    promotions: draft.promotions.filter((item) => item.id !== promotion.id)
                  })
                }
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Input
                aria-label="Título da promoção"
                onChange={(event) => {
                  const promotions = [...draft.promotions];
                  promotions[index] = { ...promotion, title: event.target.value };
                  setDraft({ ...draft, promotions });
                }}
                placeholder="Black Friday"
                value={promotion.title}
              />
              <Input
                aria-label="Cupom"
                onChange={(event) => {
                  const promotions = [...draft.promotions];
                  promotions[index] = { ...promotion, couponCode: event.target.value.toUpperCase() };
                  setDraft({ ...draft, promotions });
                }}
                placeholder="BLACKFRIDAY"
                value={promotion.couponCode}
              />
              <Input
                aria-label="Badge"
                onChange={(event) => {
                  const promotions = [...draft.promotions];
                  promotions[index] = { ...promotion, badge: event.target.value };
                  setDraft({ ...draft, promotions });
                }}
                placeholder="Oferta sazonal"
                value={promotion.badge}
              />
              <Input
                aria-label="Desconto percentual"
                inputMode="decimal"
                onChange={(event) => {
                  const promotions = [...draft.promotions];
                  promotions[index] = { ...promotion, discountPercent: Number(event.target.value.replace(",", ".")) };
                  setDraft({ ...draft, promotions });
                }}
                value={promotion.discountPercent}
              />
              <Select
                aria-label="Aplicação da promoção"
                onChange={(event) => {
                  const promotions = [...draft.promotions];
                  promotions[index] = { ...promotion, appliesTo: event.target.value as BillingPromotionDraft["appliesTo"] };
                  setDraft({ ...draft, promotions });
                }}
                value={promotion.appliesTo}
              >
                <option value="annual">Somente anual</option>
                <option value="monthly">Somente mensal</option>
                <option value="both">Mensal e anual</option>
              </Select>
              <Select
                aria-label="Visibilidade do cupom"
                onChange={(event) => {
                  const promotions = [...draft.promotions];
                  promotions[index] = { ...promotion, visibleInCheckout: event.target.value === "true" };
                  setDraft({ ...draft, promotions });
                }}
                value={String(promotion.visibleInCheckout)}
              >
                <option value="true">Mostrar no checkout</option>
                <option value="false">Cupom secreto</option>
              </Select>
              <Select
                aria-label="Destaque visual no card de preço"
                onChange={(event) => {
                  const promotions = [...draft.promotions];
                  promotions[index] = { ...promotion, highlightPriceCard: event.target.value === "true" };
                  setDraft({ ...draft, promotions });
                }}
                value={String(Boolean(promotion.highlightPriceCard))}
              >
                <option value="false">Não alterar card de preço</option>
                <option value="true">Destacar card mensal/anual</option>
              </Select>
              <Select
                aria-label="Status da promoção"
                onChange={(event) => {
                  const promotions = [...draft.promotions];
                  promotions[index] = { ...promotion, enabled: event.target.value === "true" };
                  setDraft({ ...draft, promotions });
                }}
                value={String(promotion.enabled)}
              >
                <option value="false">Desativada</option>
                <option value="true">Ativa</option>
              </Select>
              <Input
                aria-label="Início da promoção"
                onChange={(event) => {
                  const promotions = [...draft.promotions];
                  promotions[index] = { ...promotion, startsAt: event.target.value || null };
                  setDraft({ ...draft, promotions });
                }}
                placeholder="Começa em, ex: 2026-11-25 00:00"
                value={promotion.startsAt ?? ""}
              />
              <Input
                aria-label="Fim da promoção"
                onChange={(event) => {
                  const promotions = [...draft.promotions];
                  promotions[index] = { ...promotion, endsAt: event.target.value || null };
                  setDraft({ ...draft, promotions });
                }}
                placeholder="Expira em, ex: 2026-12-01 23:59"
                value={promotion.endsAt ?? ""}
              />
            </div>
            <Input
              aria-label="Descrição da promoção"
              className="mt-3"
              onChange={(event) => {
                const promotions = [...draft.promotions];
                promotions[index] = { ...promotion, description: event.target.value };
                setDraft({ ...draft, promotions });
              }}
              placeholder="Descrição curta exibida no checkout"
              value={promotion.description}
            />
          </article>
        ))}
      </div>

      <Button
        className="mt-6"
        disabled={updateMutation.isPending || !hasBillingChanges}
        onClick={() => updateMutation.mutate(draft)}
        type="button"
        variant={hasBillingChanges ? "default" : "secondary"}
      >
        {updateMutation.isPending ? (
          "Salvando..."
        ) : hasBillingChanges ? (
          "Salvar preços e promoções"
        ) : (
          <>
            <CheckCircle2 className="size-4" />
            Preços e promoções salvos
          </>
        )}
      </Button>
    </section>
  );
}
