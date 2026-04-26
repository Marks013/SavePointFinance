import { NextResponse } from "next/server";
import { z } from "zod";

import { supportPriorityLabels, supportTopicLabels } from "@/features/support/schemas/support-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateAdminUsers } from "@/lib/cache/admin-read-models";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { SUPPORT_RESPONSE_COPY, sendSupportEmail } from "@/lib/support/email";

const reopenSchema = z.object({
  reason: z.string().trim().min(10, "Explique brevemente por que deseja reabrir o chamado.").max(2000)
});

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const body = reopenSchema.parse(await request.json());
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        userId: user.id
      },
      include: {
        user: { select: { name: true, email: true, role: true } },
        tenant: { select: { name: true } }
      }
    });

    if (!ticket) {
      return NextResponse.json({ message: "Solicitação não encontrada" }, { status: 404 });
    }

    if (ticket.ratedAt) {
      return NextResponse.json({ message: "Esta conversa já foi avaliada e não pode ser reaberta." }, { status: 409 });
    }

    if (ticket.status !== "closed") {
      return NextResponse.json({ message: "Esta conversa já está aberta." }, { status: 409 });
    }

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: "open",
        closedAt: null,
        closedByAdminUserId: null,
        reopenReason: body.reason,
        reopenedAt: new Date(),
        reopenCount: { increment: 1 }
      }
    });
    await sendSupportEmail({
      id: `#${ticket.ticketNumber}`,
      contactName: ticket.contactName,
      contactEmail: ticket.contactEmail,
      topicLabel: supportTopicLabels[ticket.topic as keyof typeof supportTopicLabels] ?? ticket.topicLabel,
      priorityLabel: supportPriorityLabels[ticket.priority as keyof typeof supportPriorityLabels] ?? ticket.priorityLabel,
      subject: `Reabertura: ${ticket.subject}`,
      message: [
        `O usuário reabriu o chamado #${ticket.ticketNumber}.`,
        "",
        "Motivo da reabertura:",
        body.reason,
        "",
        "Mensagem original:",
        ticket.message
      ].join("\n"),
      context: [
        ["Chamado", `#${ticket.ticketNumber}`],
        ["Usuário", `${ticket.user.name ?? ticket.contactName} <${ticket.user.email ?? ticket.contactEmail}>`],
        ["Conta", ticket.tenant.name],
        ["Papel", ticket.user.role],
        ["Prazo informado", SUPPORT_RESPONSE_COPY]
      ]
    });
    revalidateAdminUsers(ticket.tenantId);

    return NextResponse.json({ message: "Conversa reaberta. Nossa equipe continuará o atendimento." });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "support-reopen" });
    return NextResponse.json({ message: "Failed to reopen support ticket" }, { status: 400 });
  }
}
