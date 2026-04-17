import { Prisma } from "@prisma/client";
import { revalidateTag, unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma/client";

type AdminUsersQueryInput = {
  tenantId?: string;
  role?: string | null;
  status?: string | null;
  lastLogin?: string | null;
  search?: string | null;
  sort?: string | null;
  page?: number;
  pageSize?: number;
  isPlatformAdmin?: boolean;
};

function serializeAdminUsersFilters(input: AdminUsersQueryInput) {
  return [
    input.tenantId ?? "",
    input.role ?? "",
    input.status ?? "",
    input.lastLogin ?? "",
    input.search ?? "",
    input.sort ?? "",
    String(input.page ?? 1),
    String(input.pageSize ?? 12),
    input.isPlatformAdmin ? "platform" : "tenant"
  ].join("|");
}

export function getAdminUsersTag(scope = "all") {
  return `admin-users:${scope}`;
}

export async function getCachedAdminUsers(input: AdminUsersQueryInput) {
  const search = input.search?.trim();
  const tenantId = input.tenantId?.trim();
  const role = input.role ?? "";
  const status = input.status ?? "";
  const lastLogin = input.lastLogin ?? "";
  const sort = input.sort ?? "created_desc";
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 12));
  const cacheKey = serializeAdminUsersFilters({
    tenantId,
    role,
    status,
    lastLogin,
    search,
    sort,
    page,
    pageSize,
    isPlatformAdmin: input.isPlatformAdmin
  });
  const scopeTag = tenantId || "all";

  return unstable_cache(
    async () => {
      const recentLoginSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const where: Prisma.UserWhereInput = {
        ...(input.isPlatformAdmin ? (tenantId ? { tenantId } : {}) : tenantId ? { tenantId } : {}),
        ...(role === "admin" || role === "member" ? { role } : {}),
        ...(status === "active" ? { isActive: true } : status === "inactive" ? { isActive: false } : {}),
        ...(lastLogin === "never"
          ? { lastLogin: null }
          : lastLogin === "recent"
            ? { lastLogin: { gte: recentLoginSince } }
            : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
                { email: { contains: search, mode: Prisma.QueryMode.insensitive } },
                ...(input.isPlatformAdmin
                  ? [{ tenant: { is: { name: { contains: search, mode: Prisma.QueryMode.insensitive } } } }]
                  : [])
              ]
            }
          : {})
      };

      const orderBy: Prisma.UserOrderByWithRelationInput[] =
        sort === "created_asc"
          ? [{ createdAt: "asc" }]
          : sort === "name_asc"
            ? [{ name: "asc" }]
            : sort === "login_desc"
              ? [{ lastLogin: "desc" }, { createdAt: "desc" }]
              : [{ createdAt: "desc" }];

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                planId: true,
                isActive: true,
                trialExpiresAt: true,
                expiresAt: true,
                planConfig: {
                  select: {
                    id: true,
                    name: true,
                    slug: true,
                    tier: true
                  }
                },
                users: {
                  where: {
                    role: "admin",
                    isPlatformAdmin: false,
                    isActive: true
                  },
                  orderBy: {
                    createdAt: "asc"
                  },
                  take: 1,
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            }
          },
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize
        }),
        prisma.user.count({ where })
      ]);

      const memberEmails = Array.from(
        new Set(
          users
            .filter((user) => user.role === "member")
            .map((user) => user.email.trim().toLowerCase())
            .filter(Boolean)
        )
      );

      const familyInvitations = memberEmails.length
        ? await prisma.invitation.findMany({
            where: {
              tenantId: tenantId || undefined,
              kind: "shared_wallet",
              acceptedAt: {
                not: null
              },
              revokedAt: null,
              email: {
                in: memberEmails
              },
              invitedBy: {
                isPlatformAdmin: false,
                isActive: true
              }
            },
            orderBy: {
              acceptedAt: "desc"
            },
            select: {
              email: true,
              invitedBy: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          })
        : [];

      const familyInvitationByEmail = new Map<
        string,
        {
          id: string;
          name: string;
          email: string;
        }
      >();

      for (const invitation of familyInvitations) {
        const normalizedEmail = invitation.email.trim().toLowerCase();
        if (!normalizedEmail || !invitation.invitedBy || familyInvitationByEmail.has(normalizedEmail)) {
          continue;
        }

        familyInvitationByEmail.set(normalizedEmail, invitation.invitedBy);
      }

      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      return {
        page,
        pageSize,
        total,
        totalPages,
        items: users.map((user) => {
          const fallbackAccountAdmin = user.tenant.users[0] ?? null;
          const linkedAccountAdmin =
            user.role === "member" ? familyInvitationByEmail.get(user.email.trim().toLowerCase()) ?? null : null;

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isPlatformAdmin: user.isPlatformAdmin,
            isActive: user.isActive,
            tenant: {
              id: user.tenant.id,
              name: user.tenant.name,
              slug: user.tenant.slug,
              accountAdminId: linkedAccountAdmin?.id ?? fallbackAccountAdmin?.id ?? null,
              accountAdminName: linkedAccountAdmin?.name ?? fallbackAccountAdmin?.name ?? null,
              accountAdminEmail: linkedAccountAdmin?.email ?? fallbackAccountAdmin?.email ?? null,
              planId: user.tenant.planId,
              planName: user.tenant.planConfig.name,
              planSlug: user.tenant.planConfig.slug,
              planTier: user.tenant.planConfig.tier,
              isActive: user.tenant.isActive,
              trialExpiresAt: user.tenant.trialExpiresAt?.toISOString() ?? null,
              expiresAt: user.tenant.expiresAt?.toISOString() ?? null
            },
            createdAt: user.createdAt.toISOString(),
            lastLogin: user.lastLogin?.toISOString() ?? null
          };
        })
      };
    },
    ["admin-users", scopeTag, cacheKey],
    {
      tags: [getAdminUsersTag("all"), getAdminUsersTag(scopeTag)]
    }
  )();
}

export function revalidateAdminUsers(tenantId?: string | null) {
  revalidateTag(getAdminUsersTag("all"), { expire: 0 });

  if (tenantId) {
    revalidateTag(getAdminUsersTag(tenantId), { expire: 0 });
  }
}
