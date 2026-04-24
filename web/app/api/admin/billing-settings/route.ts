import { NextResponse } from "next/server";
import { z } from "zod";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { billingSettingsSchema, getBillingSettings, saveBillingSettings } from "@/lib/billing/settings";
import { captureRequestError } from "@/lib/observability/sentry";

export async function GET() {
  try {
    const admin = await requireAdminUser();

    if (!admin.isPlatformAdmin) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      settings: await getBillingSettings()
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    captureRequestError(error, { feature: "admin-billing-settings", surface: "admin" });
    return NextResponse.json({ message: "Failed to load billing settings" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requireAdminUser();

    if (!admin.isPlatformAdmin) {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }

    const settings = await saveBillingSettings(billingSettingsSchema.parse(await request.json()));

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      action: "billing.settings.updated",
      entityType: "platform_setting",
      entityId: "billing.checkout.settings",
      summary: "Configurações comerciais de billing atualizadas",
      metadata: {
        monthlyAmount: settings.monthlyAmount,
        annualAmount: settings.annualAmount,
        annualMaxInstallments: settings.annualMaxInstallments,
        promotions: settings.promotions.length
      }
    });

    return NextResponse.json({
      message: "Configurações de billing atualizadas",
      settings
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }

    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    captureRequestError(error, { request, feature: "admin-billing-settings", surface: "admin" });
    return NextResponse.json({ message: "Failed to update billing settings" }, { status: 400 });
  }
}
