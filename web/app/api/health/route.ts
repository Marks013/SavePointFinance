import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma/client";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      checks: {
        database: "ok"
      },
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        checks: {
          database: "error"
        },
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}
