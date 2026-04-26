import { NextResponse } from "next/server";
import { z } from "zod";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { revalidateAdminUsers } from "@/lib/cache/admin-read-models";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { sendSupportReplyEmail } from "@/lib/support/email";

const replySchema = z.object({
  message: z.string().trim().min(10, "Escreva uma resposta com pelo menos 10 caracteres").max(5000)
});

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: Params) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    const body = replySchema.parse(await request.json());
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id,
        ...(admin.isPlatformAdmin ? {} : { tenantId: admin.tenantId })
      },
      include: {
        tenant: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
        replies: {
          include: {
            adminUser: { select: { name: true } }
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!ticket) {
      return NextResponse.json({ message: "Chamado de suporte não encontrado" }, { status: 404 });
    }

    if (ticket.status === "closed") {
      return NextResponse.json({ message: "Conversa encerrada. Reabra antes de responder." }, { status: 409 });
    }

    const reply = await prisma.supportTicketReply.create({
      data: {
        ticketId: ticket.id,
        adminUserId: admin.id,
        message: body.message
      }
    });
    const attemptAt = new Date();
    const result = await sendSupportReplyEmail({
      id: `#${ticket.ticketNumber}`,
      subject: ticket.subject,
      originalMessage: ticket.message,
      replyMessage: body.message,
      contactName: ticket.contactName,
      contactEmail: ticket.contactEmail,
      adminName: admin.name,
      conversationHistory: [
        {
          author: ticket.contactName,
          message: ticket.message,
          createdAt: ticket.createdAt
        },
        ...ticket.replies.map((item) => ({
          author: item.adminUser.name,
          message: item.message,
          createdAt: item.createdAt
        }))
      ]
    });

    await prisma.supportTicketReply.update({
      where: { id: reply.id },
      data: {
        deliveryStatus: result.ok ? "sent" : result.error.includes("ausente") ? "not_configured" : "failed",
        deliveryAttempts: { increment: 1 },
        lastDeliveryAttemptAt: attemptAt,
        providerMessageId: result.ok ? result.providerMessageId : null,
        providerError: result.ok ? null : result.error
      }
    });
    if (result.ok) {
      await prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: "answered",
          updatedAt: new Date()
        }
      });
    }
    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetUserId: ticket.userId,
      targetTenantId: ticket.tenantId,
      action: "support.reply",
      entityType: "support_ticket",
      entityId: ticket.id,
      summary: `Chamado respondido: ${ticket.subject}`,
      metadata: {
        replyId: reply.id,
        emailDeliveryStatus: result.ok ? "sent" : "failed"
      }
    });
    revalidateAdminUsers(ticket.tenantId);

    return NextResponse.json({
      id: reply.id,
      message: result.ok ? "Resposta registrada e enviada por e-mail" : "Resposta registrada, mas o e-mail falhou",
      emailDeliveryStatus: result.ok ? "sent" : "failed",
      providerError: result.ok ? null : result.error
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "admin-support-reply" });
    return NextResponse.json({ message: "Failed to reply support ticket" }, { status: 400 });
  }
}
