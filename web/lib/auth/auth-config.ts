import { PrismaAdapter } from "@auth/prisma-adapter";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";

import { loginSchema } from "@/features/auth/schemas/login-schema";
import { baseAuthConfig } from "@/lib/auth/base-config";
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

        const user = await prisma.user.findUnique({
          where: {
            email: parsed.data.email
          },
          include: {
            tenant: {
              select: {
                id: true,
                plan: true,
                maxUsers: true,
                isActive: true,
                trialExpiresAt: true,
                expiresAt: true
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
    session({ session, token, user }) {
      const sessionUser = user ?? token;

      if (session.user) {
        session.user.id = typeof sessionUser.id === "string" ? sessionUser.id : "";
        session.user.role = sessionUser.role === "admin" ? "admin" : "member";
        session.user.tenantId =
          typeof sessionUser.tenantId === "string" ? sessionUser.tenantId : "";
        session.user.isPlatformAdmin = Boolean(sessionUser.isPlatformAdmin);
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
