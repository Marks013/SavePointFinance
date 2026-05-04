import { NextResponse } from "next/server";
import { z } from "zod";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

function isSafePopupUrl(value: string) {
  if (value.startsWith("/")) {
    return !value.startsWith("//");
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const supportPopupSchema = z.object({
  targetUserId: z.string().trim().min(1),
  title: z.string().trim().min(3, "Informe um título para o popup.").max(90),
  body: z.string().trim().min(12, "Escreva uma mensagem objetiva.").max(700),
  ctaLabel: z.string().trim().max(32).optional().nullable(),
  ctaUrl: z.string().trim().max(500).refine(isSafePopupUrl, "URL invalida").optional().nullable()
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdminUser();
    const body = supportPopupSchema.parse(await request.json());
    const targetUser = await prisma.user.findFirst({
      where: {
        id: body.targetUserId,
        ...(admin.isPlatformAdmin ? {} : { tenantId: admin.tenantId })
      },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true
      }
    });

    if (!targetUser) {
      return NextResponse.json({ message: "Usuário não encontrado para envio individual." }, { status: 404 });
    }

    if (body.ctaLabel && !body.ctaUrl) {
      return NextResponse.json({ message: "Informe o link do botão ou remova o texto do botão." }, { status: 400 });
    }

    const campaign = await prisma.popupCampaign.create({
      data: {
        name: `Suporte individual - ${targetUser.email} - ${new Date().toISOString()}`,
        status: "active",
        kind: "announcement",
        tone: "calm",
        eyebrow: "Suporte",
        title: body.title,
        body: body.body,
        ctaLabel: body.ctaLabel?.trim() || null,
        ctaUrl: body.ctaUrl?.trim() || null,
        dismissLabel: "Entendi",
        priority: 950,
        delayMs: 800,
        autoHideMs: null,
        dismissible: true,
        oncePerUser: true,
        maxViews: 1,
        showToNewUsers: true,
        showToReturningUsers: true,
        showToPlatformAdmins: true,
        showToTenantAdmins: true,
        showToMembers: true,
        targetUserId: targetUser.id,
        createdByUserId: admin.id
      }
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetUserId: targetUser.id,
      targetTenantId: targetUser.tenantId,
      action: "support.popup.create",
      entityType: "popup_campaign",
      entityId: campaign.id,
      summary: `Popup individual enviado para ${targetUser.email}`,
      metadata: {
        title: body.title
      }
    });

    return NextResponse.json({ message: "Popup individual enviado ao usuário.", item: { id: campaign.id } });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "admin-support-popup" });
    return NextResponse.json({ message: "Failed to create support popup" }, { status: 400 });
  }
}
