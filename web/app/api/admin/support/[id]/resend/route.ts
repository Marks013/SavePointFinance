import { NextResponse } from "next/server";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { revalidateAdminUsers } from "@/lib/cache/admin-read-models";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { SUPPORT_RESPONSE_COPY, sendSupportEmail } from "@/lib/support/email";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: Params) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id,
        ...(admin.isPlatformAdmin ? {} : { tenantId: admin.tenantId })
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        tenant: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!ticket) {
      return NextResponse.json({ message: "Chamado de suporte não encontrado" }, { status: 404 });
    }

    if (!["failed", "not_configured", "bounced", "complained", "delayed"].includes(ticket.deliveryStatus)) {
      return NextResponse.json(
        { message: "Este chamado já possui entrega registrada e não precisa de reenvio." },
        { status: 409 }
      );
    }

    const attemptAt = new Date();
    const result = await sendSupportEmail({
      id: `#${ticket.ticketNumber}`,
      contactName: ticket.contactName,
      contactEmail: ticket.contactEmail,
      topicLabel: ticket.topicLabel,
      priorityLabel: ticket.priorityLabel,
      subject: ticket.subject,
      message: ticket.message,
      context: [
        ["Chamado", `#${ticket.ticketNumber}`],
        ["Usuário", `${ticket.user.name} <${ticket.user.email}>`],
        ["Conta", ticket.tenant.name],
        ["Papel", ticket.user.role],
        ["Reenvio", `Solicitado por ${admin.name} <${admin.email}>`],
        ["Prazo informado", SUPPORT_RESPONSE_COPY]
      ]
    });

    if (!result.ok) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          deliveryStatus: result.error.includes("ausente") ? "not_configured" : "failed",
          deliveryAttempts: { increment: 1 },
          lastDeliveryAttemptAt: attemptAt,
          providerError: result.error
        }
      });
      revalidateAdminUsers(ticket.tenantId);

      return NextResponse.json({ message: "Reenvio falhou", error: result.error }, { status: 502 });
    }

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        deliveryStatus: "sent",
        deliveryAttempts: { increment: 1 },
        lastDeliveryAttemptAt: attemptAt,
        providerMessageId: result.providerMessageId,
        providerError: null
      }
    });
    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetUserId: ticket.userId,
      targetTenantId: ticket.tenantId,
      action: "support.resend",
      entityType: "support_ticket",
      entityId: ticket.id,
      summary: `Chamado de suporte reenviado: ${ticket.subject}`,
      metadata: {
        providerMessageId: result.providerMessageId ?? null
      }
    });
    revalidateAdminUsers(ticket.tenantId);

    return NextResponse.json({ message: "Chamado reenviado ao suporte", providerMessageId: result.providerMessageId });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "admin-support-resend" });
    return NextResponse.json({ message: "Failed to resend support ticket" }, { status: 400 });
  }
}
