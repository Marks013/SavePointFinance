import { hash } from "bcryptjs";

import { applyPlanDefaultsToTenant, ensureDefaultPlans, getDefaultPlanBySlug } from "@/lib/licensing/default-plans";
import { prisma } from "@/lib/prisma/client";
import { processIncomingWhatsAppTextMessage } from "@/lib/whatsapp/assistant";
import { formatWhatsAppPhone } from "@/lib/whatsapp/phone";

const baseUrl = process.env.AUDIT_BASE_URL?.trim() || "http://web:3000";

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

      if (!name) {
        continue;
      }

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
  const session = (await sessionResponse.json()) as { user?: { email?: string } };
  assertCondition(session.user?.email?.toLowerCase() === email.toLowerCase(), "Sessão não foi estabelecida");

  return jar;
}

async function getJson<T>(jar: CookieJar, path: string) {
  const response = await jar.fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json"
    }
  });

  let payload: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    payload = await response.json();
  } else {
    payload = await response.text();
  }

  return {
    status: response.status,
    payload: payload as T,
    headers: response.headers
  };
}

async function run() {
  await prisma.$connect();

  const unique = Date.now().toString(36);
  const password = "Auditoria123!";
  const email = `audit-${unique}@savepoint.local`;
  const whatsappNumber = formatWhatsAppPhone("11990000001");
  assertCondition(whatsappNumber, "Não foi possível formatar o número de WhatsApp de auditoria");

  await ensureDefaultPlans(prisma);

  const freePlan = await getDefaultPlanBySlug(prisma, "gratuito-essencial");
  const premiumPlan = await getDefaultPlanBySlug(prisma, "premium-completo");

  assertCondition(freePlan, "Plano gratuito padrão não encontrado");
  assertCondition(premiumPlan, "Plano premium padrão não encontrado");

  const tenant = await prisma.tenant.create({
    data: {
      name: `Auditoria ${unique}`,
      slug: `auditoria-${unique}`,
      ...applyPlanDefaultsToTenant(freePlan),
      isActive: true,
      expiresAt: null
    }
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email,
      name: "Usuário Auditoria",
      passwordHash: await hash(password, 12),
      role: "member",
      isActive: true,
      whatsappNumber
    }
  });

  const cleanup = async () => {
    await prisma.user.deleteMany({
      where: {
        id: user.id
      }
    });

    await prisma.tenant.deleteMany({
      where: {
        id: tenant.id
      }
    });
  };

  try {
    const freeJar = await signIn(email, password);
    const freeProfile = await getJson<{
      license: {
        features: {
          whatsappAssistant: boolean;
          automation: boolean;
          pdfExport: boolean;
        };
        planLabel: string;
      };
    }>(freeJar, "/api/profile");

    assertCondition(freeProfile.status === 200, `Perfil do plano gratuito respondeu ${freeProfile.status}`);
    assertCondition(freeProfile.payload.license.features.automation === false, "Automação deveria estar bloqueada");
    assertCondition(freeProfile.payload.license.features.pdfExport === false, "PDF deveria estar bloqueado");
    assertCondition(
      freeProfile.payload.license.features.whatsappAssistant === false,
      "WhatsApp deveria estar bloqueado"
    );

    const freeAutomation = await getJson(freeJar, "/api/automation");
    const freeNotifications = await getJson(freeJar, "/api/notifications");
    const freePdf = await freeJar.fetch(`${baseUrl}/api/reports/pdf`);
    const freeAdminPage = await freeJar.fetch(`${baseUrl}/dashboard/admin`);
    const freeWhatsApp = await processIncomingWhatsAppTextMessage({
      phoneNumber: whatsappNumber,
      body: "saldo"
    });

    assertCondition(freeAutomation.status === 401, `Automação no gratuito respondeu ${freeAutomation.status}`);
    assertCondition(freeNotifications.status === 401, `Notificações no gratuito responderam ${freeNotifications.status}`);
    assertCondition(freePdf.status === 401, `PDF no gratuito respondeu ${freePdf.status}`);
    assertCondition(
      freeAdminPage.status === 307 || freeAdminPage.status === 302,
      `Painel admin para membro respondeu ${freeAdminPage.status}`
    );
    assertCondition(
      freeWhatsApp.response.includes("plano Premium"),
      `WhatsApp no gratuito não retornou bloqueio por licença: ${freeWhatsApp.response}`
    );

    await prisma.tenant.update({
      where: {
        id: tenant.id
      },
      data: {
        ...applyPlanDefaultsToTenant(premiumPlan),
        isActive: true,
        expiresAt: null
      }
    });

    const premiumJar = await signIn(email, password);
    const premiumProfile = await getJson<{
      license: {
        features: {
          whatsappAssistant: boolean;
          automation: boolean;
          pdfExport: boolean;
        };
        planLabel: string;
      };
    }>(premiumJar, "/api/profile");

    assertCondition(premiumProfile.status === 200, `Perfil do premium respondeu ${premiumProfile.status}`);
    assertCondition(
      premiumProfile.payload.license.features.automation === true,
      "Automação deveria estar liberada no premium"
    );
    assertCondition(
      premiumProfile.payload.license.features.pdfExport === true,
      "PDF deveria estar liberado no premium"
    );
    assertCondition(
      premiumProfile.payload.license.features.whatsappAssistant === true,
      "WhatsApp deveria estar liberado no premium"
    );

    const premiumAutomation = await getJson(premiumJar, "/api/automation");
    const premiumNotifications = await getJson(premiumJar, "/api/notifications");
    const premiumPdf = await premiumJar.fetch(`${baseUrl}/api/reports/pdf`);
    const premiumWhatsApp = await processIncomingWhatsAppTextMessage({
      phoneNumber: whatsappNumber,
      body: "saldo"
    });

    assertCondition(premiumAutomation.status === 200, `Automação no premium respondeu ${premiumAutomation.status}`);
    assertCondition(
      premiumNotifications.status === 200,
      `Notificações no premium responderam ${premiumNotifications.status}`
    );
    assertCondition(premiumPdf.status === 200, `PDF no premium respondeu ${premiumPdf.status}`);
    assertCondition(
      (premiumPdf.headers.get("content-type") ?? "").includes("application/pdf"),
      "PDF premium não retornou application/pdf"
    );
    assertCondition(
      premiumWhatsApp.response.includes("Não encontrei contas ativas") ||
        premiumWhatsApp.response.includes("Saldo consolidado") ||
        premiumWhatsApp.response.includes("Saldo atual"),
      `WhatsApp no premium não avançou além do bloqueio de licença: ${premiumWhatsApp.response}`
    );

    console.log("FEATURE_AUDIT_OK");
    console.log(
      JSON.stringify(
        {
          free: {
            planLabel: freeProfile.payload.license.planLabel,
            automation: freeAutomation.status,
            notifications: freeNotifications.status,
            pdf: freePdf.status,
            adminPage: freeAdminPage.status,
            whatsapp: freeWhatsApp.response
          },
          premium: {
            planLabel: premiumProfile.payload.license.planLabel,
            automation: premiumAutomation.status,
            notifications: premiumNotifications.status,
            pdf: premiumPdf.status,
            whatsapp: premiumWhatsApp.response
          }
        },
        null,
        2
      )
    );
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

run().catch(async (error) => {
  console.error("FEATURE_AUDIT_FAILED");
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
