import { NextResponse } from "next/server";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { deletePopupCampaign, getPopupCampaignUserMessage, updatePopupCampaign } from "@/lib/notifications/popup-campaigns";
import { captureRequestError } from "@/lib/observability/sentry";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function requirePlatformAdmin() {
  const admin = await requireAdminUser();

  if (!admin.isPlatformAdmin) {
    throw new Error("Forbidden");
  }

  return admin;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const admin = await requirePlatformAdmin();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const campaign = await updatePopupCampaign(id, body);

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      action: "popup.campaign.updated",
      entityType: "popup_campaign",
      entityId: campaign.id,
      summary: `Campanha popup atualizada: ${campaign.name}`,
      metadata: {
        kind: campaign.kind,
        status: campaign.status,
        tone: campaign.tone
      }
    });

    return NextResponse.json({
      message: "Campanha popup atualizada",
      item: campaign
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    captureRequestError(error, { request, feature: "popup-campaign-admin", surface: "admin" });
    return NextResponse.json(
      { message: getPopupCampaignUserMessage(error, "Não foi possível atualizar a campanha de popup.") },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const admin = await requirePlatformAdmin();
    const { id } = await context.params;
    await deletePopupCampaign(id);

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      action: "popup.campaign.deleted",
      entityType: "popup_campaign",
      entityId: id,
      summary: `Campanha popup removida: ${id}`
    });

    return NextResponse.json({
      message: "Campanha popup removida"
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    captureRequestError(error, { request, feature: "popup-campaign-admin", surface: "admin" });
    return NextResponse.json({ message: "Failed to delete popup campaign" }, { status: 400 });
  }
}
