import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma/client";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return NextResponse.json({ message: "Token obrigatorio" }, { status: 400 });
  }

  const invitation = await prisma.invitation.findUnique({
    where: {
      token
    },
    include: {
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

  return NextResponse.json({
    email: invitation.email,
    name: invitation.name,
    role: invitation.role,
    tenantName: invitation.tenant.name,
    expiresAt: invitation.expiresAt.toISOString()
  });
}
