import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { acceptInvitationSchema } from "@/features/password/schemas/password-schema";
import { getTenantSeatSummary } from "@/lib/licensing/server";
import { prisma } from "@/lib/prisma/client";

export async function POST(request: Request) {
  try {
    const body = acceptInvitationSchema.parse(await request.json());

    const invitation = await prisma.invitation.findUnique({
      where: {
        token: body.token
      }
    });

    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      return NextResponse.json({ message: "Convite invalido ou expirado" }, { status: 400 });
    }

    const seatSummary = await getTenantSeatSummary(invitation.tenantId);

    if (!seatSummary?.license.canAccessApp) {
      return NextResponse.json({ message: "A organização está com a licença indisponível" }, { status: 403 });
    }

    if (seatSummary.remainingSeats !== null && seatSummary.remainingSeats <= 0) {
      return NextResponse.json({ message: "O limite de usuários do plano atual foi atingido" }, { status: 409 });
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email: invitation.email
      }
    });

    if (existingUser) {
      return NextResponse.json({ message: "Ja existe um usuario com este e-mail" }, { status: 409 });
    }

    const passwordHash = await hash(body.password, 10);

    const user = await prisma.user.create({
      data: {
        tenantId: invitation.tenantId,
        email: invitation.email,
        name: body.name,
        passwordHash,
        role: invitation.role,
        isActive: true,
        preferences: {
          create: {}
        }
      }
    });

    await prisma.invitation.update({
      where: {
        id: invitation.id
      },
      data: {
        acceptedAt: new Date(),
        name: body.name
      }
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Dados inválidos" }, { status: 400 });
    }

    return NextResponse.json({ message: "Failed to accept invitation" }, { status: 400 });
  }
}
