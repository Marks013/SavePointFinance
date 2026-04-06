import crypto from "node:crypto";
import { NotificationChannel } from "@prisma/client";
import { NextResponse } from "next/server";

import { forgotPasswordSchema } from "@/features/password/schemas/password-schema";
import { normalizeEmail } from "@/lib/auth/normalize-email";
import { deliverNotification } from "@/lib/notifications/delivery";
import { buildPasswordResetMessage } from "@/lib/notifications/password-reset";
import { prisma } from "@/lib/prisma/client";

export async function POST(request: Request) {
  try {
    const body = forgotPasswordSchema.parse(await request.json());
    const normalizedEmail = normalizeEmail(body.email);
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
      message: resetMessage.message
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ message: "Failed to start reset flow" }, { status: 400 });
  }
}
