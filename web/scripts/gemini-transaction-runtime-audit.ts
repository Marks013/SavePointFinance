import { hash } from "bcryptjs";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../.env"), override: false });
loadEnv({ path: resolve(process.cwd(), ".env"), override: false });

const baseUrl = process.env.AUDIT_BASE_URL?.trim() || "http://web:3000";

class CookieJar {
  private readonly store = new Map<string, string>();

  private updateFromResponse(response: Response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];

    if (setCookies.length === 0) {
      const fallbackCookie = response.headers.get("set-cookie");

      if (fallbackCookie) {
        setCookies.push(fallbackCookie);
      }
    }

    for (const entry of setCookies) {
      const [pair] = entry.split(";", 1);
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) continue;
      const name = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (!name) continue;
      this.store.set(name, value);
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

async function signIn(email: string, password: string) {
  const jar = new CookieJar();
  const csrfResponse = await jar.fetch(`${baseUrl}/api/auth/csrf`);
  assertCondition(csrfResponse.ok, `Falha ao carregar CSRF: ${csrfResponse.status}`);
  const csrfPayload = (await csrfResponse.json()) as { csrfToken?: string };
  assertCondition(csrfPayload.csrfToken, "CSRF token não encontrado");

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
  assertCondition(sessionResponse.ok, `Falha ao carregar sessão: ${sessionResponse.status}`);
  const session = (await sessionResponse.json()) as { user?: { email?: string } } | null;
  assertCondition(session?.user?.email?.toLowerCase() === email.toLowerCase(), "Sessão não foi estabelecida");

  return jar;
}

async function main() {
  const { prisma } = await import("../lib/prisma/client");
  const { ensureDefaultPlans, getDefaultPlanBySlug, applyPlanDefaultsToTenant } = await import(
    "../lib/licensing/default-plans"
  );

  await prisma.$connect();
  await ensureDefaultPlans(prisma);

  const unique = Date.now().toString(36);
  const tenant = await prisma.tenant.create({
    data: {
      name: `Conta auditoria Gemini ${unique}`,
      slug: `conta-auditoria-gemini-${unique}`,
      ...(applyPlanDefaultsToTenant(
        (await getDefaultPlanBySlug(prisma, "premium-completo")) ??
          (() => {
            throw new Error("Plano premium padrão não encontrado");
          })()
      )),
      isActive: true,
      expiresAt: null
    }
  });

  try {
    const userPassword = "GeminiAudit123!";
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `gemini-audit-${unique}@savepoint.local`,
        name: "Pessoa Auditoria Gemini",
        passwordHash: await hash(userPassword, 10),
        role: "admin",
        isActive: true
      }
    });

    const account = await prisma.financialAccount.create({
      data: {
        tenantId: tenant.id,
        ownerUserId: user.id,
        name: "Conta Gemini Audit",
        type: "checking",
        openingBalance: 500,
        currency: "BRL",
        color: "#111111",
        institution: "Nubank",
        isActive: true
      }
    });

    await prisma.category.createMany({
      data: [
        {
          tenantId: tenant.id,
          name: "Compras domésticas",
          type: "expense",
          color: "#6B7280",
          icon: "tag",
          keywords: [],
          isDefault: false
        },
        {
          tenantId: tenant.id,
          name: "Saúde cotidiana",
          type: "expense",
          color: "#6B7280",
          icon: "tag",
          keywords: [],
          isDefault: false
        },
        {
          tenantId: tenant.id,
          name: "Assinaturas digitais",
          type: "expense",
          color: "#6B7280",
          icon: "tag",
          keywords: [],
          isDefault: false
        }
      ]
    });

    const jar = await signIn(user.email, userPassword);

    const response = await jar.fetch(`${baseUrl}/api/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        date: "2026-04-06",
        amount: 39.9,
        description: "renovação disney plus anual",
        type: "expense",
        paymentMethod: "pix",
        accountId: account.id,
        installments: 1
      })
    });

    const payload = (await response.json()) as {
      id?: string;
      classification?: {
        auto: boolean;
        ai: boolean;
        confidence: number | null;
        reason?: string;
      } | null;
      category?: {
        id: string;
        name: string;
      } | null;
      message?: string;
    };

    assertCondition(response.status === 201, `Criação da transação respondeu ${response.status}: ${payload.message ?? "sem mensagem"}`);
    assertCondition(Boolean(payload.classification?.auto), "A classificação automática não foi sinalizada");
    assertCondition(Boolean(payload.classification?.ai), `A classificação não foi marcada como IA: ${JSON.stringify(payload.classification)}`);
    assertCondition(
      payload.category?.name === "Assinaturas digitais",
      `Categoria inesperada para o caso Gemini: ${payload.category?.name ?? "sem categoria"}`
    );

    console.log("GEMINI_TRANSACTION_AUDIT_OK");
    console.log(
      JSON.stringify(
        {
          category: payload.category?.name,
          classification: payload.classification
        },
        null,
        2
      )
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: {
        id: tenant.id
      }
    });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("GEMINI_TRANSACTION_AUDIT_FAILED");
  console.error(error instanceof Error ? error.message : error);
  const { prisma } = await import("../lib/prisma/client");
  await prisma.$disconnect();
  process.exitCode = 1;
});
