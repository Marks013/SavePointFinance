import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/auth/session";
import { revalidateAdminUsers } from "@/lib/cache/admin-read-models";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

const ratingSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    problemResolved: z.boolean(),
    reason: z.string().trim().max(1200).optional(),
    improvement: z.string().trim().max(1200).optional()
  })
  .superRefine((value, context) => {
    if (value.rating < 4 && (!value.reason || value.reason.length < 10)) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Conte brevemente o motivo da avaliação para nos ajudar a melhorar."
      });
    }
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
    const body = ratingSchema.parse(await request.json());
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

    if (ticket.status !== "closed") {
      return NextResponse.json({ message: "A conversa ainda não foi encerrada para avaliação." }, { status: 409 });
    }

    if (ticket.ratedAt) {
      return NextResponse.json({ message: "Esta conversa já foi avaliada." }, { status: 409 });
    }

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        rating: body.rating,
        ratingProblemResolved: body.problemResolved,
        ratingReason: body.rating < 4 ? (body.reason ?? null) : (body.reason || null),
        ratingImprovement: body.improvement || null,
        ratedAt: new Date()
      }
    });
    revalidateAdminUsers(ticket.tenantId);

    return NextResponse.json({ message: "Obrigado pela avaliação. Ela foi registrada para melhorar o atendimento." });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "support-rating" });
    return NextResponse.json({ message: "Failed to rate support ticket" }, { status: 400 });
  }
}
