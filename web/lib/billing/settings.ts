import { z } from "zod";

import { serverEnv } from "@/lib/env/server";
import { prisma } from "@/lib/prisma/client";

export const BILLING_SETTINGS_KEY = "billing.checkout.settings";

const billingCycleSchema = z.enum(["monthly", "annual", "both"]);

export const billingPromotionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().trim().min(1),
  badge: z.string().trim().optional().default("Promoção"),
  description: z.string().trim().optional().default(""),
  couponCode: z.string().trim().optional().default(""),
  discountPercent: z.coerce.number().min(0).max(95).default(0),
  appliesTo: billingCycleSchema.default("both"),
  visibleInCheckout: z.boolean().default(true),
  highlightPriceCard: z.boolean().default(false),
  enabled: z.boolean().default(false),
  startsAt: z.string().trim().nullable().optional().default(null),
  endsAt: z.string().trim().nullable().optional().default(null)
});

export const billingSettingsSchema = z.object({
  monthlyAmount: z.coerce.number().positive(),
  annualAmount: z.coerce.number().positive(),
  annualMaxInstallments: z.coerce.number().int().positive().max(24).default(12),
  currencyId: z.string().trim().min(3).max(3).default("BRL"),
  promotions: z.array(billingPromotionSchema).default([])
});

export type BillingSettings = z.infer<typeof billingSettingsSchema>;
export type BillingPromotion = z.infer<typeof billingPromotionSchema>;
export type BillingCycle = "monthly" | "annual";

function getEnvMonthlyAmount() {
  return typeof serverEnv.MP_BILLING_AMOUNT === "number" ? Number(serverEnv.MP_BILLING_AMOUNT.toFixed(2)) : 49.9;
}

function getEnvAnnualAmount(monthlyAmount: number) {
  return typeof serverEnv.MP_BILLING_ANNUAL_AMOUNT === "number"
    ? Number(serverEnv.MP_BILLING_ANNUAL_AMOUNT.toFixed(2))
    : Number((monthlyAmount * 10).toFixed(2));
}

export function getDefaultBillingSettings(): BillingSettings {
  const monthlyAmount = getEnvMonthlyAmount();

  return {
    monthlyAmount,
    annualAmount: getEnvAnnualAmount(monthlyAmount),
    annualMaxInstallments: serverEnv.MP_BILLING_ANNUAL_MAX_INSTALLMENTS,
    currencyId: serverEnv.MP_BILLING_CURRENCY.trim().toUpperCase(),
    promotions: [
      {
        id: "black-friday",
        title: "Black Friday",
        badge: "Oferta sazonal",
        description: "Desconto promocional para campanhas de Black Friday.",
        couponCode: "BLACKFRIDAY",
        discountPercent: 20,
        appliesTo: "annual",
        visibleInCheckout: true,
        highlightPriceCard: true,
        enabled: false,
        startsAt: null,
        endsAt: null
      },
      {
        id: "founders",
        title: "Fundadores",
        badge: "Lançamento",
        description: "Cupom opcional para primeiros clientes e parceiros.",
        couponCode: "FUNDADORES",
        discountPercent: 15,
        appliesTo: "both",
        visibleInCheckout: true,
        highlightPriceCard: false,
        enabled: false,
        startsAt: null,
        endsAt: null
      }
    ]
  };
}

export async function getBillingSettings() {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return getDefaultBillingSettings();
  }

  let setting: Awaited<ReturnType<typeof prisma.platformSetting.findUnique>>;

  try {
    setting = await prisma.platformSetting.findUnique({
      where: {
        key: BILLING_SETTINGS_KEY
      }
    });
  } catch {
    return getDefaultBillingSettings();
  }

  if (!setting) {
    return getDefaultBillingSettings();
  }

  return billingSettingsSchema.parse({
    ...getDefaultBillingSettings(),
    ...(setting.value && typeof setting.value === "object" && !Array.isArray(setting.value) ? setting.value : {})
  });
}

export async function saveBillingSettings(input: unknown) {
  const settings = billingSettingsSchema.parse(input);

  await prisma.platformSetting.upsert({
    where: {
      key: BILLING_SETTINGS_KEY
    },
    update: {
      value: settings
    },
    create: {
      key: BILLING_SETTINGS_KEY,
      value: settings
    }
  });

  return settings;
}

function isPromotionActive(promotion: BillingPromotion, now = new Date()) {
  if (!promotion.enabled || promotion.discountPercent <= 0) {
    return false;
  }

  const startsAt = promotion.startsAt ? new Date(promotion.startsAt) : null;
  const endsAt = promotion.endsAt ? new Date(promotion.endsAt) : null;

  if (startsAt && !Number.isNaN(startsAt.getTime()) && startsAt > now) {
    return false;
  }

  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt < now) {
    return false;
  }

  return true;
}

function appliesToCycle(promotion: BillingPromotion, cycle: BillingCycle) {
  return promotion.appliesTo === "both" || promotion.appliesTo === cycle;
}

export function getActiveBillingPromotions(settings: BillingSettings, cycle?: BillingCycle) {
  return settings.promotions.filter(
    (promotion) => isPromotionActive(promotion) && (!cycle || appliesToCycle(promotion, cycle))
  );
}

export function calculateBillingCheckoutPricing(input: {
  settings: BillingSettings;
  cycle: BillingCycle;
  couponCode?: string | null;
}) {
  const baseAmount = input.cycle === "annual" ? input.settings.annualAmount : input.settings.monthlyAmount;
  const couponCode = input.couponCode?.trim().toUpperCase() ?? "";
  const promotion = couponCode
    ? getActiveBillingPromotions(input.settings, input.cycle).find(
        (item) => item.couponCode.trim().toUpperCase() === couponCode
      ) ?? null
    : null;
  const discountAmount = promotion ? Number((baseAmount * (promotion.discountPercent / 100)).toFixed(2)) : 0;
  const finalAmount = Number(Math.max(baseAmount - discountAmount, 0.01).toFixed(2));

  return {
    baseAmount,
    finalAmount,
    discountAmount,
    currencyId: input.settings.currencyId,
    promotion: promotion
      ? {
          id: promotion.id,
          title: promotion.title,
          couponCode: promotion.couponCode,
          discountPercent: promotion.discountPercent
        }
      : null
  };
}
