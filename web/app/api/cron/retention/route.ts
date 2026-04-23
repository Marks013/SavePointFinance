import { NextResponse } from "next/server";

import { serverEnv } from "@/lib/env/server";
import { captureRequestError } from "@/lib/observability/sentry";
import { runRetentionLifecycle } from "@/lib/retention/service";

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const fallbackToken = request.headers.get("x-automation-secret");

  return bearerToken === serverEnv.AUTOMATION_CRON_SECRET || fallbackToken === serverEnv.AUTOMATION_CRON_SECRET;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const result = await runRetentionLifecycle();

    return NextResponse.json({
      message: "Rotina de retenção executada",
      result
    });
  } catch (error) {
    captureRequestError(error, { request, feature: "retention-cron", surface: "cron" });
    return NextResponse.json({ message: "Failed to run retention cron" }, { status: 500 });
  }
}
