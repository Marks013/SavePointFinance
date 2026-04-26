import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
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
    const user = await requireSessionUser();
    const { id } = await context.params;
    const ticket = await prisma.supportTicket.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        userId: user.id
      },
      select: {
        id: true,
        tenantId: true,
        status: true,
        ratedAt: true
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
        closedByAdminUserId: null
      }
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
