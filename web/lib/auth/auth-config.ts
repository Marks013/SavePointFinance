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
import { getClientIpAddress, peekThrottleState, takeThrottleHit } from "@/lib/security/request-throttle";

const LOGIN_THROTTLE_LIMIT = 5;
const LOGIN_THROTTLE_NAMESPACE = "credentials-login";
const LOGIN_THROTTLE_WINDOW_MS = 15 * 60 * 1000;

function buildLoginThrottleKeys(request: Request, email: string) {
  const keys = [`email:${email}`];
  const clientIp = getClientIpAddress(request);

  if (clientIp) {
    keys.push(`ip:${clientIp}`);
  }

  return keys;
}

async function isLoginThrottled(request: Request, email: string) {
  for (const key of buildLoginThrottleKeys(request, email)) {
    const result = await peekThrottleState({
      key,
      limit: LOGIN_THROTTLE_LIMIT,
      namespace: LOGIN_THROTTLE_NAMESPACE,
      windowMs: LOGIN_THROTTLE_WINDOW_MS
    });

    if (!result.allowed) {
      return true;
    }
  }

  return false;
}

async function registerFailedLoginAttempt(request: Request, email: string) {
  for (const key of buildLoginThrottleKeys(request, email)) {
    await takeThrottleHit({
      key,
      limit: LOGIN_THROTTLE_LIMIT,
      namespace: LOGIN_THROTTLE_NAMESPACE,
      windowMs: LOGIN_THROTTLE_WINDOW_MS
    });
  }
}

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
        async authorize(credentials, request) {
          const parsed = loginSchema.safeParse(credentials);

          if (!parsed.success) {
            return null;
          }

          const normalizedEmail = normalizeEmail(parsed.data.email);

          if (await isLoginThrottled(request, normalizedEmail)) {
            return null;
          }

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
            await registerFailedLoginAttempt(request, normalizedEmail);
            return null;
          }

          const passwordMatches = await compare(parsed.data.password, user.passwordHash);
          const license = resolveTenantLicenseState(user.tenant);

          if (!passwordMatches || !user.isActive || (!user.isPlatformAdmin && !license.canAccessApp)) {
            await registerFailedLoginAttempt(request, normalizedEmail);
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
          isPlatformAdmin: user.isPlatformAdmin,
          previousLastLogin: (user.lastLogin ?? user.createdAt).toISOString()
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
        token.previousLastLogin = user.previousLastLogin ?? null;
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
        session.user.previousLastLogin =
          typeof token.previousLastLogin === "string" ? token.previousLastLogin : null;
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
