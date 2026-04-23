import { NextResponse } from "next/server";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { createPopupCampaign, getPopupCampaignUserMessage, listPopupCampaigns } from "@/lib/notifications/popup-campaigns";
import { captureRequestError } from "@/lib/observability/sentry";

async function requirePlatformAdmin() {
  const admin = await requireAdminUser();

  if (!admin.isPlatformAdmin) {
    throw new Error("Forbidden");
  }

  return admin;
}

export async function GET() {
  try {
    await requirePlatformAdmin();

    return NextResponse.json({
      items: await listPopupCampaigns()
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to load popup campaigns" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await request.json().catch(() => ({}));
    const campaign = await createPopupCampaign(body, admin.id);

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      action: "popup.campaign.created",
      entityType: "popup_campaign",
      entityId: campaign.id,
      summary: `Campanha popup criada: ${campaign.name}`,
      metadata: {
        kind: campaign.kind,
        status: campaign.status,
        tone: campaign.tone
      }
    });

    return NextResponse.json(
      {
        message: "Campanha popup criada",
        item: campaign
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    captureRequestError(error, { request, feature: "popup-campaign-admin", surface: "admin" });
    return NextResponse.json(
      { message: getPopupCampaignUserMessage(error, "Não foi possível criar a campanha de popup.") },
      { status: 400 }
    );
  }
}
