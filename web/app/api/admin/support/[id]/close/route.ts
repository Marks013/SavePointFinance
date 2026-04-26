import { NextResponse } from "next/server";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { revalidateAdminUsers } from "@/lib/cache/admin-read-models";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

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
      select: {
        id: true,
        tenantId: true,
        userId: true,
        subject: true,
        status: true
      }
    });

    if (!ticket) {
      return NextResponse.json({ message: "Solicitação não encontrada" }, { status: 404 });
    }

    if (ticket.status === "closed") {
      return NextResponse.json({ message: "Solicitação já encerrada" }, { status: 409 });
    }

    const closedAt = new Date();

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: "closed",
        closedAt,
        closedByAdminUserId: admin.id
      }
    });
    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetUserId: ticket.userId,
      targetTenantId: ticket.tenantId,
      action: "support.close",
      entityType: "support_ticket",
      entityId: ticket.id,
      summary: `Solicitação encerrada como resolvida: ${ticket.subject}`,
      metadata: {
        closedAt: closedAt.toISOString()
      }
    });
    revalidateAdminUsers(ticket.tenantId);

    return NextResponse.json({
      message: "Conversa encerrada como resolvida. O usuário verá o pedido de avaliação.",
      closedAt: closedAt.toISOString()
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "admin-support-close" });
    return NextResponse.json({ message: "Failed to close support ticket" }, { status: 400 });
  }
}
