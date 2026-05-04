import crypto from "node:crypto";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { resetPasswordSchema } from "@/features/password/schemas/password-schema";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { getClientIpAddress, takeThrottleHit } from "@/lib/security/request-throttle";

function buildThrottleResponse(retryAfterMs: number) {
  return NextResponse.json(
    { message: "Muitas tentativas de redefinição. Aguarde alguns minutos e tente novamente." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil(retryAfterMs / 1000)))
      }
    }
  );
}

async function enforceResetThrottle(request: Request, hashedToken: string) {
  const keys = [`token:${hashedToken}`];
  const clientIp = getClientIpAddress(request);

  if (clientIp) {
    keys.push(`ip:${clientIp}`);
  }

  for (const key of keys) {
    const result = await takeThrottleHit({
      namespace: "reset-password",
      key,
      limit: 8,
      windowMs: 15 * 60 * 1000
    });

    if (!result.allowed) {
      return buildThrottleResponse(result.retryAfterMs);
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = resetPasswordSchema.parse(await request.json());
    const hashedToken = crypto.createHash("sha256").update(body.token).digest("hex");
    const throttled = await enforceResetThrottle(request, hashedToken);

    if (throttled) {
      return throttled;
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: hashedToken
      }
    });

    if (!user || !user.resetTokenExpires || user.resetTokenExpires < new Date()) {
      return NextResponse.json({ message: "Token invalido ou expirado" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hash(body.newPassword, 10),
        resetToken: null,
        resetTokenExpires: null
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    captureRequestError(error, { request, feature: "auth-password" });
    return NextResponse.json({ message: "Failed to reset password" }, { status: 400 });
  }
}
