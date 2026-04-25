import { hash } from "bcryptjs";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { installMaintenanceBypassFetch } from "./audit-maintenance-bypass";

loadEnv({ path: resolve(process.cwd(), "../.env"), override: false });
loadEnv({ path: resolve(process.cwd(), ".env"), override: false });
installMaintenanceBypassFetch();

const baseUrl = process.env.AUDIT_BASE_URL?.trim() || "http://127.0.0.1:3000";
const adminEmail = process.env.ADMIN_EMAIL?.trim();
const adminPassword = process.env.ADMIN_PASSWORD?.trim();

class CookieJar {
  private readonly store = new Map<string, string>();

  private updateFromResponse(response: Response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : (response.headers
            .get("set-cookie")
            ?.split(/,(?=\s*[^;,\s]+=)/g)
            .map((entry) => entry.trim())
            .filter(Boolean) ?? []);

    for (const entry of setCookies) {
      const [pair] = entry.split(";", 1);
      const separatorIndex = pair.indexOf("=");

      if (separatorIndex === -1) {
        continue;
      }

      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();

      if (name) {
        this.store.set(name, value);
      }
    }
  }

  private buildCookieHeader() {
    return Array.from(this.store.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  async fetch(input: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    const cookieHeader = this.buildCookieHeader();

    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }

    const response = await fetch(input, {
      ...init,
      headers,
      redirect: init.redirect ?? "manual"
    });

    this.updateFromResponse(response);
    return response;
  }
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function getJson<T>(jar: CookieJar, path: string, init?: RequestInit) {
  const response = await jar.fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {})
    }
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json")
    ? ((await response.json()) as T)
    : ((await response.text()) as T);

  return {
    payload,
    status: response.status
  };
}

async function signIn(email: string, password: string) {
  const jar = new CookieJar();
  const csrfResponse = await jar.fetch(`${baseUrl}/api/auth/csrf`);
  assertCondition(csrfResponse.ok, `Falha ao carregar CSRF: ${csrfResponse.status}`);

  const csrfPayload = (await csrfResponse.json()) as { csrfToken?: string };
  assertCondition(csrfPayload.csrfToken, "CSRF token nao encontrado");

  const form = new URLSearchParams();
  form.set("email", email);
  form.set("password", password);
  form.set("csrfToken", csrfPayload.csrfToken);
  form.set("callbackUrl", `${baseUrl}/dashboard`);
  form.set("json", "true");

  const callbackResponse = await jar.fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1"
    },
    body: form
  });

  assertCondition(
    callbackResponse.status === 200 || callbackResponse.status === 302,
    `Falha no login por credenciais: ${callbackResponse.status}`
  );

  const sessionResponse = await jar.fetch(`${baseUrl}/api/auth/session`);
  assertCondition(sessionResponse.ok, `Falha ao carregar sessao: ${sessionResponse.status}`);

  const session = (await sessionResponse.json()) as { user?: { email?: string } } | null;
  assertCondition(session?.user?.email?.toLowerCase() === email.toLowerCase(), "Sessao nao foi estabelecida");

  return jar;
}

async function acceptInvitation(token: string, name: string, password: string) {
  const response = await fetch(`${baseUrl}/api/auth/accept-invitation`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      token,
      name,
      password,
      confirmPassword: password,
      acceptTermsOfUse: true,
      acceptPrivacyPolicy: true
    })
  });

  const payload = (await response.json()) as { success?: boolean; message?: string };
  return {
    payload,
    status: response.status
  };
}

function tokenFromInviteUrl(inviteUrl: string) {
  const token = new URL(inviteUrl, baseUrl).searchParams.get("token");
  assertCondition(token, "Convite nao retornou token no link");
  return token;
}

async function run() {
  const { prisma } = await import("@/lib/prisma/client");
  const { ensureTenantDefaultCategories } = await import("@/lib/finance/default-categories");
  const { applyPlanDefaultsToTenant, ensureDefaultPlans, getDefaultPlanBySlug } = await import("@/lib/licensing/default-plans");

  assertCondition(adminEmail, "ADMIN_EMAIL nao definido");
  assertCondition(adminPassword, "ADMIN_PASSWORD nao definido");

  await prisma.$connect();
  await ensureDefaultPlans(prisma);

  const unique = Date.now().toString(36);
  const createdTenantIds = new Set<string>();
  const results: string[] = [];

  try {
    const adminJar = await signIn(adminEmail, adminPassword);
    const plansResponse = await getJson<{
      items: Array<{ id: string; isActive: boolean; slug: string; tier: string }>;
    }>(adminJar, "/api/admin/plans");

    assertCondition(plansResponse.status === 200, `Planos responderam ${plansResponse.status}`);
    const selectedPlan =
      plansResponse.payload.items.find((plan) => plan.isActive && plan.tier === "free") ??
      plansResponse.payload.items.find((plan) => plan.isActive);
    assertCondition(selectedPlan, "Nenhum plano ativo encontrado para o teste");

    const adminInviteEmail = `audit-admin-${unique}@savepoint.local`;
    const missingPlanInvite = await getJson<{ message?: string }>(adminJar, "/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: adminInviteEmail,
        name: "Auditoria Admin Isolado",
        role: "member"
      })
    });
    assertCondition(
      missingPlanInvite.status === 400,
      `Convite de Admin sem plano respondeu ${missingPlanInvite.status}, esperado 400`
    );
    results.push("Convite de Admin sem plano explicito foi bloqueado");

    const adminInvite = await getJson<{ id: string; inviteUrl?: string }>(adminJar, "/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: adminInviteEmail,
        name: "Auditoria Admin Isolado",
        role: "member",
        planId: selectedPlan.id
      })
    });
    assertCondition(adminInvite.status === 201, `Convite de Admin com plano respondeu ${adminInvite.status}`);
    assertCondition(adminInvite.payload.inviteUrl, "Convite de Admin nao retornou inviteUrl");

    const adminInvitationRecord = await prisma.invitation.findUniqueOrThrow({
      where: { id: adminInvite.payload.id },
      select: { kind: true, tenantId: true }
    });
    createdTenantIds.add(adminInvitationRecord.tenantId);
    assertCondition(adminInvitationRecord.kind === "admin_isolated", "Convite de Admin nao foi gravado como admin_isolated");

    const adminInvitedPassword = "AuditAdmin123!";
    const adminAccept = await acceptInvitation(
      tokenFromInviteUrl(adminInvite.payload.inviteUrl),
      "Auditoria Admin Isolado",
      adminInvitedPassword
    );
    assertCondition(adminAccept.status === 200, `Aceite do convite Admin respondeu ${adminAccept.status}`);

    const adminInvitedJar = await signIn(adminInviteEmail, adminInvitedPassword);
    const isolatedAccounts = await getJson<{ items: Array<{ id: string }> }>(adminInvitedJar, "/api/accounts");
    const isolatedCards = await getJson<{ items: Array<{ id: string }> }>(adminInvitedJar, "/api/cards");
    const isolatedTransactions = await getJson<{ items: Array<{ id: string }> }>(
      adminInvitedJar,
      "/api/transactions?month=2026-04&limit=20"
    );
    assertCondition(isolatedAccounts.status === 200 && isolatedAccounts.payload.items.length === 0, "Convite Admin recebeu contas indevidas");
    assertCondition(isolatedCards.status === 200 && isolatedCards.payload.items.length === 0, "Convite Admin recebeu cartoes indevidos");
    assertCondition(
      isolatedTransactions.status === 200 && isolatedTransactions.payload.items.length === 0,
      "Convite Admin recebeu transacoes indevidas"
    );
    results.push("Convite de Admin criou carteira isolada e vazia");

    const ownerPlan = await getDefaultPlanBySlug(prisma, "premium-completo");
    assertCondition(ownerPlan, "Plano premium-completo nao encontrado para montar carteira compartilhada");

    const ownerTenant = await prisma.tenant.create({
      data: {
        name: `Carteira auditoria compartilhada ${unique}`,
        slug: `audit-shared-${unique}`,
        ...applyPlanDefaultsToTenant(ownerPlan),
        isActive: true,
        expiresAt: null
      }
    });
    createdTenantIds.add(ownerTenant.id);
    await ensureTenantDefaultCategories(ownerTenant.id, prisma);

    const ownerPassword = "AuditOwner123!";
    const ownerEmail = `audit-owner-${unique}@savepoint.local`;
    const owner = await prisma.user.create({
      data: {
        tenantId: ownerTenant.id,
        email: ownerEmail,
        name: "Auditoria Titular",
        passwordHash: await hash(ownerPassword, 10),
        role: "admin",
        isActive: true,
        preferences: {
          create: {}
        }
      }
    });

    const sharedAccount = await prisma.financialAccount.create({
      data: {
        tenantId: ownerTenant.id,
        ownerUserId: owner.id,
        name: `Conta compartilhada ${unique}`,
        type: "checking",
        openingBalance: 321,
        currency: "BRL",
        color: "#136f4f"
      }
    });

    await prisma.transaction.create({
      data: {
        tenantId: ownerTenant.id,
        userId: owner.id,
        accountId: sharedAccount.id,
        date: new Date("2026-04-07T12:00:00Z"),
        competence: "2026-04",
        amount: 123.45,
        description: "Lancamento compartilhado auditoria",
        type: "expense",
        source: "manual",
        paymentMethod: "pix"
      }
    });

    const ownerJar = await signIn(ownerEmail, ownerPassword);
    const sharingInviteEmail = `audit-family-${unique}@savepoint.local`;
    const sharingInvite = await getJson<{ id: string; inviteUrl?: string }>(ownerJar, "/api/sharing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Auditoria Familiar",
        email: sharingInviteEmail
      })
    });
    assertCondition(sharingInvite.status === 201, `Convite de compartilhamento respondeu ${sharingInvite.status}`);
    assertCondition(sharingInvite.payload.inviteUrl, "Convite de compartilhamento nao retornou inviteUrl");

    const sharingInvitationRecord = await prisma.invitation.findUniqueOrThrow({
      where: { id: sharingInvite.payload.id },
      select: { kind: true, tenantId: true }
    });
    assertCondition(sharingInvitationRecord.kind === "shared_wallet", "Convite familiar nao foi gravado como shared_wallet");
    assertCondition(sharingInvitationRecord.tenantId === ownerTenant.id, "Convite familiar nao apontou para a carteira do titular");

    const sharingPassword = "AuditFamily123!";
    const sharingAccept = await acceptInvitation(
      tokenFromInviteUrl(sharingInvite.payload.inviteUrl),
      "Auditoria Familiar",
      sharingPassword
    );
    assertCondition(sharingAccept.status === 200, `Aceite do convite familiar respondeu ${sharingAccept.status}`);

    const familyJar = await signIn(sharingInviteEmail, sharingPassword);
    const familyAccounts = await getJson<{ items: Array<{ id: string; name: string }> }>(familyJar, "/api/accounts");
    const familyTransactions = await getJson<{ items: Array<{ id: string; description: string }> }>(
      familyJar,
      "/api/transactions?month=2026-04&limit=20"
    );

    assertCondition(
      familyAccounts.status === 200 && familyAccounts.payload.items.some((item) => item.id === sharedAccount.id),
      "Convidado familiar nao enxerga a conta compartilhada"
    );
    assertCondition(
      familyTransactions.status === 200 &&
        familyTransactions.payload.items.some((item) => item.description === "Lancamento compartilhado auditoria"),
      "Convidado familiar nao enxerga os lancamentos compartilhados"
    );
    results.push("Convite familiar dividiu a carteira do titular");

    for (const result of results) {
      console.log(`[ok] ${result}`);
    }
  } finally {
    for (const tenantId of createdTenantIds) {
      await prisma.tenant.deleteMany({
        where: {
          id: tenantId,
          slug: {
            startsWith: "audit-"
          }
        }
      });
    }

    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error("[fail] Auditoria de convites falhou");
  console.error(error);
  process.exitCode = 1;
});
