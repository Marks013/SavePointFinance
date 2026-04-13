import crypto from "node:crypto";
import { hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { resetPasswordSchema } from "@/features/password/schemas/password-schema";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

export async function POST(request: Request) {
  try {
    const body = resetPasswordSchema.parse(await request.json());
    const hashedToken = crypto.createHash("sha256").update(body.token).digest("hex");
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
