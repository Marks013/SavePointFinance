import crypto from "node:crypto";
import { NotificationChannel } from "@prisma/client";
import { NextResponse } from "next/server";

import { forgotPasswordSchema } from "@/features/password/schemas/password-schema";
import { normalizeEmail } from "@/lib/auth/normalize-email";
import { deliverNotification } from "@/lib/notifications/delivery";
import { buildPasswordResetMessage } from "@/lib/notifications/password-reset";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { getClientIpAddress, takeThrottleHit } from "@/lib/security/request-throttle";

const FORGOT_PASSWORD_IP_LIMIT = 5;
const FORGOT_PASSWORD_IP_WINDOW_MS = 15 * 60 * 1000;
const FORGOT_PASSWORD_EMAIL_LIMIT = 3;
const FORGOT_PASSWORD_EMAIL_WINDOW_MS = 15 * 60 * 1000;
const FORGOT_PASSWORD_EMAIL_COOLDOWN_MS = 60 * 1000;

function buildThrottleResponse(retryAfterMs: number) {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));

  return NextResponse.json(
    {
      message: "Aguarde antes de solicitar outra recuperação de senha."
    },
    {
      status: 429,
      headers: {
        "Retry-After": retryAfterSeconds.toString()
      }
    }
  );
}

export async function POST(request: Request) {
  try {
    const body = forgotPasswordSchema.parse(await request.json());
    const normalizedEmail = normalizeEmail(body.email);
    const clientIp = getClientIpAddress(request);
    if (clientIp) {
      const ipThrottle = await takeThrottleHit({
        namespace: "forgot-password:ip",
        key: clientIp,
        limit: FORGOT_PASSWORD_IP_LIMIT,
        windowMs: FORGOT_PASSWORD_IP_WINDOW_MS
      });

      if (!ipThrottle.allowed) {
        return buildThrottleResponse(ipThrottle.retryAfterMs);
      }
    }

    const emailCooldown = await takeThrottleHit({
      namespace: "forgot-password:email-cooldown",
      key: normalizedEmail,
      limit: 1,
      windowMs: FORGOT_PASSWORD_EMAIL_COOLDOWN_MS
    });

    if (!emailCooldown.allowed) {
      return buildThrottleResponse(emailCooldown.retryAfterMs);
    }

    const emailThrottle = await takeThrottleHit({
      namespace: "forgot-password:email-window",
      key: normalizedEmail,
      limit: FORGOT_PASSWORD_EMAIL_LIMIT,
      windowMs: FORGOT_PASSWORD_EMAIL_WINDOW_MS
    });

    if (!emailThrottle.allowed) {
      return buildThrottleResponse(emailThrottle.retryAfterMs);
    }

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive"
        }
      }
    });

    if (!user) {
      return NextResponse.json({ success: true });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExpires: expiresAt
      }
    });

    const resetMessage = buildPasswordResetMessage(token, user.name);

    await deliverNotification({
      tenantId: user.tenantId,
      userId: user.id,
      channel: NotificationChannel.email,
      target: user.email,
      subject: resetMessage.subject,
      message: resetMessage.message,
      html: resetMessage.html
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    captureRequestError(error, { request, feature: "auth-password" });
    return NextResponse.json({ message: "Failed to start reset flow" }, { status: 400 });
  }
}
