import { NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/auth/admin";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export async function GET(request: Request) {
  try {
    const admin = await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.trim();
    const deliveryStatus = searchParams.get("deliveryStatus")?.trim();
    const search = searchParams.get("search")?.trim();
    const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize") ?? "25") || 25));

    const tickets = await prisma.supportTicket.findMany({
      where: {
        ...(admin.isPlatformAdmin ? {} : { tenantId: admin.tenantId }),
        ...(status && status !== "all" ? { status: status as "open" | "answered" | "closed" } : {}),
        ...(deliveryStatus && deliveryStatus !== "all" ? { deliveryStatus } : {}),
        ...(search
          ? {
              OR: [
                { subject: { contains: search, mode: "insensitive" } },
                { message: { contains: search, mode: "insensitive" } },
                { contactEmail: { contains: search, mode: "insensitive" } },
                { contactName: { contains: search, mode: "insensitive" } },
                { user: { is: { email: { contains: search, mode: "insensitive" } } } },
                { tenant: { is: { name: { contains: search, mode: "insensitive" } } } }
              ]
            }
          : {})
      },
      include: {
        tenant: { select: { id: true, name: true, slug: true } },
        user: { select: { id: true, name: true, email: true } },
        replies: {
          include: {
            adminUser: { select: { id: true, name: true, email: true } }
          },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ createdAt: "desc" }],
      take: pageSize
    });

    return NextResponse.json({
      items: tickets.map((ticket) => ({
        id: ticket.id,
        tenant: ticket.tenant,
        user: ticket.user,
        topicLabel: ticket.topicLabel,
        priorityLabel: ticket.priorityLabel,
        subject: ticket.subject,
        message: ticket.message,
        contactName: ticket.contactName,
        contactEmail: ticket.contactEmail,
        status: ticket.status,
        deliveryStatus: ticket.deliveryStatus,
        deliveryAttempts: ticket.deliveryAttempts,
        lastDeliveryAttemptAt: serializeDate(ticket.lastDeliveryAttemptAt),
        providerError: ticket.providerError,
        expectedResponseAt: serializeDate(ticket.expectedResponseAt),
        createdAt: ticket.createdAt.toISOString(),
        updatedAt: ticket.updatedAt.toISOString(),
        replies: ticket.replies.map((reply) => ({
          id: reply.id,
          message: reply.message,
          deliveryStatus: reply.deliveryStatus,
          deliveryAttempts: reply.deliveryAttempts,
          lastDeliveryAttemptAt: serializeDate(reply.lastDeliveryAttemptAt),
          providerError: reply.providerError,
          providerMessageId: reply.providerMessageId,
          createdAt: reply.createdAt.toISOString(),
          admin: reply.adminUser
        }))
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "admin-support" });
    return NextResponse.json({ message: "Failed to load support tickets" }, { status: 400 });
  }
}
