import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";

type HealthCheck = {
  latencyMs?: number;
  message?: string;
  missing?: string[];
  status: CheckStatus;
};

const requiredEnvKeys = ["DATABASE_URL", "AUTH_SECRET", "AUTOMATION_CRON_SECRET"] as const;
const whatsappEnvKeys = [
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_APP_SECRET"
] as const;
const mercadoPagoEnvKeys = ["MP_ACCESS_TOKEN", "MP_PUBLIC_KEY", "MP_WEBHOOK_SECRET"] as const;

function hasEnvValue(key: string) {
  return typeof process.env[key] === "string" && process.env[key]?.trim().length > 0;
}

function getMissingEnvKeys() {
  const missing: string[] = requiredEnvKeys.filter((key) => !hasEnvValue(key));

  if (process.env.WHATSAPP_ASSISTANT_ENABLED === "true") {
    missing.push(...whatsappEnvKeys.filter((key) => !hasEnvValue(key)));
  }

  if (process.env.MP_BILLING_ENABLED === "true") {
    missing.push(...mercadoPagoEnvKeys.filter((key) => !hasEnvValue(key)));
  }

  return missing;
}

async function checkDatabase(): Promise<HealthCheck> {
  const startedAt = Date.now();

  try {
    const { prisma } = await import("@/lib/prisma/client");

    await prisma.$queryRaw`SELECT 1`;

    return {
      status: "ok",
      latencyMs: Date.now() - startedAt
    };
  } catch {
    return {
      status: "error",
      latencyMs: Date.now() - startedAt,
      message: "Database check failed."
    };
  }
}

export async function GET() {
  const startedAt = Date.now();
  const [database] = await Promise.all([checkDatabase()]);
  const missingEnv = getMissingEnvKeys();

  const environment: HealthCheck =
    missingEnv.length > 0
      ? {
          status: "error",
          missing: missingEnv
        }
      : { status: "ok" };

  const checks = {
    database,
    environment
  };
  const status = Object.values(checks).every((check) => check.status === "ok") ? "ok" : "degraded";

  return NextResponse.json(
    {
      status,
      service: "savepointfinance-web",
      checks,
      runtime: {
        nodeEnv: process.env.NODE_ENV ?? "unknown",
        maintenanceMode: process.env.MAINTENANCE_MODE === "true",
        uptimeSeconds: Math.round(process.uptime())
      },
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    },
    { status: status === "ok" ? 200 : 503 }
  );
}
