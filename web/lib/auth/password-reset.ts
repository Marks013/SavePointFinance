import crypto from "node:crypto";
import { NotificationChannel } from "@prisma/client";

import { deliverNotification } from "@/lib/notifications/delivery";
import { buildPasswordResetMessage } from "@/lib/notifications/password-reset";
import { prisma } from "@/lib/prisma/client";

type PasswordResetUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
};

export async function issuePasswordResetForUser(user: PasswordResetUser) {
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

  return {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    expiresAt
  };
}
