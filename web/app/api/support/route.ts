import { NextResponse } from "next/server";

import {
  supportPriorityLabels,
  supportRequestSchema,
  supportTopicLabels
} from "@/features/support/schemas/support-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateAdminUsers } from "@/lib/cache/admin-read-models";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { getClientIpAddress, takeThrottleHit } from "@/lib/security/request-throttle";
import { SUPPORT_RESPONSE_COPY, sendSupportEmail } from "@/lib/support/email";

const SUPPORT_HISTORY_LIMIT = 5;
const SUPPORT_WINDOW_MS = 60 * 60 * 1000;

function buildThrottleResponse(retryAfterMs: number) {
  return NextResponse.json(
    { message: "Muitas solicitações de suporte. Aguarde alguns minutos e tente novamente." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000)))
      }
    }
  );
}

async function enforceSupportThrottle(request: Request, userId: string) {
  const keys = [`user:${userId}`];
  const clientIp = getClientIpAddress(request);

  if (clientIp) {
    keys.push(`ip:${clientIp}`);
  }

  for (const key of keys) {
    const result = await takeThrottleHit({
      namespace: "support-request",
      key,
      limit: 5,
      windowMs: SUPPORT_WINDOW_MS
    });

    if (!result.allowed) {
      return buildThrottleResponse(result.retryAfterMs);
    }
  }

  return null;
}

function resolveExpectedResponseAt(now = new Date()) {
  const expected = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const day = expected.getDay();

  if (day === 0) {
    expected.setDate(expected.getDate() + 1);
    expected.setHours(9, 0, 0, 0);
  }

  if (day === 6) {
    expected.setDate(expected.getDate() + 2);
    expected.setHours(9, 0, 0, 0);
  }

  return expected;
}

function serializeTicket(ticket: {
  id: string;
  ticketNumber: number;
  topicLabel: string;
  priorityLabel: string;
  subject: string;
  message: string;
  status: string;
  deliveryStatus: string;
  expectedResponseAt: Date | null;
  closedAt: Date | null;
  reopenReason: string | null;
  reopenedAt: Date | null;
  reopenCount: number;
  rating: number | null;
  ratingProblemResolved: boolean | null;
  ratingReason: string | null;
  ratingImprovement: string | null;
  ratedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  replies?: Array<{
    id: string;
    message: string;
    deliveryStatus: string;
    createdAt: Date;
  }>;
}) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    topicLabel: ticket.topicLabel,
    priorityLabel: ticket.priorityLabel,
    subject: ticket.subject,
    message: ticket.message,
    messagePreview: ticket.message.length > 180 ? `${ticket.message.slice(0, 177)}...` : ticket.message,
    status: ticket.status,
    deliveryStatus: ticket.deliveryStatus,
    expectedResponseAt: ticket.expectedResponseAt?.toISOString() ?? null,
    closedAt: ticket.closedAt?.toISOString() ?? null,
    reopenReason: ticket.reopenReason,
    reopenedAt: ticket.reopenedAt?.toISOString() ?? null,
    reopenCount: ticket.reopenCount,
    rating: ticket.rating,
    ratingProblemResolved: ticket.ratingProblemResolved,
    ratingReason: ticket.ratingReason,
    ratingImprovement: ticket.ratingImprovement,
    ratedAt: ticket.ratedAt?.toISOString() ?? null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    replies:
      ticket.replies?.map((reply) => ({
        id: reply.id,
        message: reply.message,
        deliveryStatus: reply.deliveryStatus,
        createdAt: reply.createdAt.toISOString()
      })) ?? []
  };
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const throttled = await enforceSupportThrottle(request, user.id);

    if (throttled) {
      return throttled;
    }

    const body = supportRequestSchema.parse(await request.json());
    const topicLabel = supportTopicLabels[body.topic];
    const priorityLabel = supportPriorityLabels[body.priority];
    const expectedResponseAt = resolveExpectedResponseAt();
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        topic: body.topic,
        topicLabel,
        priority: body.priority,
        priorityLabel,
        subject: body.subject,
        message: body.message,
        contactName: body.contactName,
        contactEmail: body.contactEmail,
        allowAccountContext: body.allowAccountContext,
        expectedResponseAt
      }
    });
    const context: Array<[string, string]> = body.allowAccountContext
      ? [
          ["Chamado", `#${ticket.ticketNumber}`],
          ["Usuário", `${user.name ?? "Sem nome"} <${user.email ?? "sem e-mail"}>`],
          ["Conta", user.tenant?.name ?? user.tenantId],
          ["Papel", user.role],
          ["Plano", user.license.planLabel],
          ["Origem", request.headers.get("referer") ?? "/dashboard/support"],
          ["Prazo informado", SUPPORT_RESPONSE_COPY]
        ]
      : [];
    const attemptAt = new Date();
    const result = await sendSupportEmail({
      id: `#${ticket.ticketNumber}`,
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      topicLabel,
      priorityLabel,
      subject: body.subject,
      message: body.message,
      context
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
      revalidateAdminUsers(user.tenantId);

      return NextResponse.json(
        {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          deliveryStatus: result.error.includes("ausente") ? "not_configured" : "failed",
          expectedResponseAt: expectedResponseAt.toISOString(),
          responseWindow: SUPPORT_RESPONSE_COPY,
          message:
            result.error.includes("ausente")
              ? "Chamado registrado, mas o suporte por e-mail ainda não está configurado. O superadmin verá a falha para reenviar."
              : "Chamado registrado, mas houve falha ao enviar o e-mail. O superadmin verá a falha para reenviar."
        },
        { status: 202 }
      );
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
    revalidateAdminUsers(user.tenantId);

    return NextResponse.json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      deliveryStatus: "sent",
      providerMessageId: result.providerMessageId,
      expectedResponseAt: expectedResponseAt.toISOString(),
      responseWindow: SUPPORT_RESPONSE_COPY,
      message: "Mensagem enviada ao suporte"
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "support" });
    return NextResponse.json({ message: "Failed to send support request" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const requestedLimit = Number(searchParams.get("limit") ?? SUPPORT_HISTORY_LIMIT) || SUPPORT_HISTORY_LIMIT;
    const limit = Math.min(SUPPORT_HISTORY_LIMIT, Math.max(1, requestedLimit));
    const tickets = await prisma.supportTicket.findMany({
      where: {
        tenantId: user.tenantId,
        userId: user.id
      },
      orderBy: {
        createdAt: "desc"
      },
      include: {
        replies: {
          where: {
            deliveryStatus: {
              in: ["sent", "delivered"]
            }
          },
          orderBy: {
            createdAt: "asc"
          },
          select: {
            id: true,
            message: true,
            deliveryStatus: true,
            createdAt: true
          }
        }
      },
      take: limit
    });

    return NextResponse.json({
      responseWindow: SUPPORT_RESPONSE_COPY,
      items: tickets.map(serializeTicket)
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "support-history" });
    return NextResponse.json({ message: "Failed to load support history" }, { status: 400 });
  }
}
