import { NextResponse } from "next/server";

import { getEmailChannelHealth, getWhatsAppChannelHealth } from "@/lib/notifications/channel-health";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    const email = getEmailChannelHealth();
    const whatsapp = getWhatsAppChannelHealth();

    return NextResponse.json({
      status: "ok",
      checks: {
        database: "ok",
        email: {
          provider: email.provider,
          configured: email.configured
        },
        whatsapp: {
          configured: whatsapp.configured
        }
      },
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        checks: {
          database: "error"
        },
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "health-check-failed"
      },
      { status: 503 }
    );
  }
}
