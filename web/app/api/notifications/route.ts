import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser({ feature: "automation" });
    const deliveries = await prisma.notificationDelivery.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [{ userId: user.id }, { userId: null }]
      },
      include: {
        goal: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 12
    });

    return NextResponse.json({
      items: deliveries.map((delivery) => ({
        id: delivery.id,
        channel: delivery.channel,
        status: delivery.status,
        target: delivery.target,
        subject: delivery.subject,
        message: delivery.message,
        responseCode: delivery.responseCode,
        errorMessage: delivery.errorMessage,
        attemptedAt: delivery.attemptedAt?.toISOString() ?? null,
        deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
        goal: delivery.goal
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "notifications" });
    return NextResponse.json({ message: "Failed to load notifications" }, { status: 500 });
  }
}
