import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma/client";
import { hashInvitationToken } from "@/lib/security/invitation-token";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ message: "Token obrigatorio" }, { status: 400 });
  }

  const invitation = await prisma.invitation.findFirst({
    where: {
      OR: [{ token: hashInvitationToken(token) }, { token }]
    },
    include: {
      invitedBy: {
        select: {
          name: true,
          isPlatformAdmin: true
        }
      },
      tenant: {
        select: {
          name: true
        }
      }
    }
  });

  if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    return NextResponse.json({ message: "Convite invalido ou expirado" }, { status: 404 });
  }

  const invitationRole = invitation.kind === "shared_wallet" ? "member" : "admin";
  const accountAdminName =
    invitation.kind === "shared_wallet" && invitation.invitedBy && !invitation.invitedBy.isPlatformAdmin
      ? invitation.invitedBy.name
      : null;

  return NextResponse.json({
    email: invitation.email,
    name: invitation.name,
    role: invitationRole,
    tenantName: invitation.tenant.name,
    accountAdminName,
    expiresAt: invitation.expiresAt.toISOString()
  });
}
