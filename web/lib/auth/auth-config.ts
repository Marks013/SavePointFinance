import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";

import { loginSchema } from "@/features/auth/schemas/login-schema";
import { logAdminAudit } from "@/lib/admin/audit";
import { baseAuthConfig } from "@/lib/auth/base-config";
import { normalizeEmail } from "@/lib/auth/normalize-email";
import { resolveTenantLicenseState } from "@/lib/licensing/policy";
import { prisma } from "@/lib/prisma/client";

export const authConfig = {
  ...baseAuthConfig,
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt"
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" }
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const normalizedEmail = normalizeEmail(parsed.data.email);

        const user = await prisma.user.findFirst({
          where: {
            email: {
              equals: normalizedEmail,
              mode: "insensitive"
            }
          },
          include: {
            tenant: {
              select: {
                id: true,
                isActive: true,
                trialExpiresAt: true,
                expiresAt: true,
                planConfig: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    tier: true,
                    maxAccounts: true,
                    maxCards: true,
                    whatsappAssistant: true,
                    automation: true,
                    pdfExport: true,
                    trialDays: true,
                    isActive: true
                  }
                }
              }
            }
          }
        });

        if (!user?.passwordHash || !user.tenant) {
          return null;
        }

        const passwordMatches = await compare(parsed.data.password, user.passwordHash);
        const license = resolveTenantLicenseState(user.tenant);

        if (!passwordMatches || !user.isActive || (!user.isPlatformAdmin && !license.canAccessApp)) {
          return null;
        }

        const now = new Date();

        await prisma.user.update({
          where: {
            id: user.id
          },
          data: {
            lastLogin: now,
            loginCount: {
              increment: 1
            }
          }
        });

        await logAdminAudit({
          actorUserId: user.id,
          actorTenantId: user.tenantId,
          targetUserId: user.id,
          targetTenantId: user.tenantId,
          action: "auth.login",
          entityType: "session",
          entityId: user.id,
          summary: `Acesso autenticado de ${user.email}`,
          metadata: {
            accessAt: now.toISOString(),
            role: user.role,
            isPlatformAdmin: user.isPlatformAdmin
          }
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          isPlatformAdmin: user.isPlatformAdmin
        };
      }
    })
  ],
  callbacks: {
    ...baseAuthConfig.callbacks,
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.isPlatformAdmin = Boolean(user.isPlatformAdmin);
      }

      return token;
    },
    async session({ session, token, user }) {
      if (session.user) {
        const sessionUser = user ?? token;
        const currentUser =
          typeof token.id === "string"
            ? await prisma.user.findUnique({
                where: {
                  id: token.id
                },
                select: {
                  id: true,
                  role: true,
                  tenantId: true,
                  isPlatformAdmin: true
                }
              })
            : null;

        session.user.id = currentUser?.id ?? (typeof sessionUser.id === "string" ? sessionUser.id : "");
        session.user.role = currentUser?.role ?? (sessionUser.role === "admin" ? "admin" : "member");
        session.user.tenantId = currentUser?.tenantId ?? (typeof sessionUser.tenantId === "string" ? sessionUser.tenantId : "");
        session.user.isPlatformAdmin = currentUser?.isPlatformAdmin ?? Boolean(sessionUser.isPlatformAdmin);
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
