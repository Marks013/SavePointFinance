import crypto from "node:crypto";

import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { publicRegistrationSchema } from "@/features/password/schemas/password-schema";
import { logAdminAudit } from "@/lib/admin/audit";
import { normalizeEmail } from "@/lib/auth/normalize-email";
import { ensureTenantDefaultCategories } from "@/lib/finance/default-categories";
import { PRIVACY_POLICY_VERSION, TERMS_OF_USE_VERSION } from "@/lib/legal/documents";
import { applyPlanDefaultsToTenant, ensureDefaultPlans, getDefaultPlanBySlug } from "@/lib/licensing/default-plans";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { getClientIpAddress, takeThrottleHit } from "@/lib/security/request-throttle";

const planSlugByIntent = {
  free: "gratuito-essencial",
  trial: "avaliacao-premium-14-dias",
  pro: "gratuito-essencial",
  pro_annual: "gratuito-essencial"
} as const;

const nextPathByIntent = {
  free: "/dashboard",
  trial: "/dashboard",
  pro: "/billing?intent=checkout",
  pro_annual: "/billing?intent=checkout&cycle=annual"
} as const;

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

async function buildUniqueTenantSlug(organizationName: string) {
  const baseSlug = slugify(organizationName) || "conta";

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const suffix = crypto.randomBytes(3).toString("hex");
    const slug = `${baseSlug}-${suffix}`;
    const existing = await prisma.tenant.findUnique({
      where: {
        slug
      },
      select: {
        id: true
      }
    });

    if (!existing) {
      return slug;
    }
  }

  return `${baseSlug}-${Date.now().toString(36)}`;
}

async function enforceRegistrationThrottle(request: Request, email: string) {
  const clientIp = getClientIpAddress(request);
  const throttleKeys = [`email:${email}`];

  if (clientIp) {
    throttleKeys.push(`ip:${clientIp}`);
  }

  for (const key of throttleKeys) {
    const result = await takeThrottleHit({
      key,
      limit: 5,
      namespace: "public-registration",
      windowMs: 60 * 60 * 1000
    });

    if (!result.allowed) {
      return NextResponse.json(
        {
          message: "Muitas tentativas de cadastro. Aguarde alguns minutos e tente novamente."
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(result.retryAfterMs / 1000))
          }
        }
      );
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = publicRegistrationSchema.parse(await request.json());
    const normalizedEmail = normalizeEmail(body.email);
    const throttledResponse = await enforceRegistrationThrottle(request, normalizedEmail);

    if (throttledResponse) {
      return throttledResponse;
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive"
        }
      },
      select: {
        id: true
      }
    });

    if (existingUser) {
      return NextResponse.json({ success: true, nextPath: "/login" }, { status: 202 });
    }

    await ensureDefaultPlans(prisma);

    const plan = await getDefaultPlanBySlug(prisma, planSlugByIntent[body.plan]);

    if (!plan?.isActive) {
      return NextResponse.json({ message: "Plano indisponivel para cadastro" }, { status: 409 });
    }

    const passwordHash = await hash(body.password, 10);
    const tenant = await prisma.tenant.create({
      data: {
        name: body.organizationName.trim(),
        slug: await buildUniqueTenantSlug(body.organizationName),
        ...applyPlanDefaultsToTenant(plan),
        isActive: true,
        expiresAt: null
      }
    });

    await ensureTenantDefaultCategories(tenant.id);

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: normalizedEmail,
        name: body.name.trim(),
        passwordHash,
        role: "admin",
        isActive: true,
        preferences: {
          create: {
            autoTithe: false
          }
        }
      }
    });

    await logAdminAudit({
      actorUserId: user.id,
      actorTenantId: tenant.id,
      targetUserId: user.id,
      targetTenantId: tenant.id,
      action: "auth.public_registration_created",
      entityType: "tenant",
      entityId: tenant.id,
      summary: `Conta publica criada para ${user.email}`,
      metadata: {
        requestedPlan: body.plan,
        appliedPlanSlug: plan.slug,
        acceptedTermsOfUseVersion: TERMS_OF_USE_VERSION,
        acceptedPrivacyPolicyVersion: PRIVACY_POLICY_VERSION,
        acceptedAt: new Date().toISOString()
      }
    });

    return NextResponse.json(
      {
        success: true,
        nextPath: nextPathByIntent[body.plan]
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Dados invalidos" }, { status: 400 });
    }

    captureRequestError(error, { request, feature: "public-registration" });
    return NextResponse.json({ message: "Falha ao criar conta" }, { status: 400 });
  }
}
