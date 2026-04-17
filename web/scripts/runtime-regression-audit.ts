import { hash } from "bcryptjs";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../.env"), override: false });
loadEnv({ path: resolve(process.cwd(), ".env"), override: false });

const baseUrl = process.env.AUDIT_BASE_URL?.trim() || "http://127.0.0.1:3000";
const adminEmail = process.env.ADMIN_EMAIL?.trim();
const adminPassword = process.env.ADMIN_PASSWORD?.trim();

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

async function getJson<T>(jar: CookieJar, path: string, init?: RequestInit) {
  const response = await jar.fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {})
    }
  });

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? ((await response.json()) as T) : ((await response.text()) as T);

  return {
    status: response.status,
    payload
  };
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

async function signInExpectFailure(email: string, password: string) {
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
    `Resposta inesperada no login inválido: ${callbackResponse.status}`
  );

  const sessionResponse = await jar.fetch(`${baseUrl}/api/auth/session`);
  assertCondition(sessionResponse.ok, `Falha ao carregar sessão após login inválido: ${sessionResponse.status}`);
  const session = (await sessionResponse.json()) as { user?: { email?: string } } | null;
  assertCondition(!session?.user?.email, "Login inválido criou sessão indevida");
}

async function createTenant(name: string, slug: string, planSlug = "premium-completo") {
  const { applyPlanDefaultsToTenant, getDefaultPlanBySlug } = await import("@/lib/licensing/default-plans");
  const { ensureTenantDefaultCategories } = await import("@/lib/finance/default-categories");
  const { prisma } = await import("@/lib/prisma/client");
  const plan = await getDefaultPlanBySlug(prisma, planSlug);
  assertCondition(plan, `Plano padrão não encontrado: ${planSlug}`);

  const tenant = await prisma.tenant.create({
    data: {
      name,
      slug,
      ...applyPlanDefaultsToTenant(plan),
      isActive: true,
      expiresAt: null
    }
  });

  await ensureTenantDefaultCategories(tenant.id, prisma);
  return tenant;
}

async function createUser(data: {
  tenantId: string;
  email: string;
  name: string;
  password: string;
  role?: "admin" | "member";
}) {
  const { prisma } = await import("@/lib/prisma/client");
  return prisma.user.create({
    data: {
      tenantId: data.tenantId,
      email: data.email,
      name: data.name,
      passwordHash: await hash(data.password, 10),
      role: data.role ?? "member",
      isActive: true,
      preferences: {
        create: {}
      }
    }
  });
}

async function run() {
  const { prisma } = await import("@/lib/prisma/client");
  const { ensureDefaultPlans, getDefaultPlanBySlug } = await import("@/lib/licensing/default-plans");
  assertCondition(adminEmail, "ADMIN_EMAIL não definido");
  assertCondition(adminPassword, "ADMIN_PASSWORD não definido");

  await prisma.$connect();
  await ensureDefaultPlans(prisma);
  const premiumPlan = await getDefaultPlanBySlug(prisma, "premium-completo");
  assertCondition(premiumPlan, "Plano premium padrao nao encontrado");

  const unique = Date.now().toString(36);
  const createdTenantIds: string[] = [];
  const results: string[] = [];

  try {
    const loginPage = await fetch(`${baseUrl}/login`);
    assertCondition(loginPage.ok, `Página de login respondeu ${loginPage.status}`);
    const loginHtml = await loginPage.text();
    assertCondition(!/organiza[cç][aã]o/i.test(loginHtml), "Login ainda expõe campo ou texto de organização");
    results.push("Login não expõe organização na interface pública");

    await signInExpectFailure(adminEmail, `${adminPassword}-invalida`);
    results.push("Login inválido não cria sessão");

    const adminJar = await signIn(adminEmail.toUpperCase(), adminPassword);
    const adminProfile = await getJson<{ email: string }>(adminJar, "/api/profile");
    assertCondition(adminProfile.status === 200, `Perfil do admin respondeu ${adminProfile.status}`);
    results.push("Login aceita e-mail em maiúsculas/minúsculas");

    const memberAuditTenant = await createTenant(`Conta auditoria membro ${unique}`, `conta-auditoria-membro-${unique}`);
    createdTenantIds.push(memberAuditTenant.id);
    const memberPassword = "Auditoria123!";
    const memberEmail = `membro-${unique}@savepoint.local`;
    await createUser({
      tenantId: memberAuditTenant.id,
      email: memberEmail,
      name: "Pessoa Auditoria",
      password: memberPassword
    });

    const memberJar = await signIn(memberEmail.toUpperCase(), memberPassword);
    const memberAdminPage = await memberJar.fetch(`${baseUrl}/dashboard/admin`);
    assertCondition(
      memberAdminPage.status === 302 || memberAdminPage.status === 307,
      `Membro acessou /dashboard/admin com status ${memberAdminPage.status}`
    );
    results.push("Membro não acessa painel admin");

    const accountCreate = await getJson<{ id: string }>(memberJar, "/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Conta Teste",
        type: "checking",
        balance: 0,
        currency: "BRL",
        color: "#111111",
        institution: "Nubank"
      })
    });
    assertCondition(accountCreate.status === 201, `Criação de conta respondeu ${accountCreate.status}`);

    const accountDuplicate = await getJson<{ message?: string }>(memberJar, "/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  conta   teste ",
        type: "checking",
        balance: 0,
        currency: "BRL",
        color: "#111111",
        institution: "Nubank"
      })
    });
    assertCondition(accountDuplicate.status === 409, `Duplicidade de conta respondeu ${accountDuplicate.status}`);
    results.push("Conta duplicada é bloqueada");

    const categoryCreate = await getJson<{ id: string }>(memberJar, "/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Teste Padaria",
        icon: "tag",
        color: "#111111",
        type: "expense",
        monthlyLimit: 0,
        keywords: "padaria,pao"
      })
    });
    assertCondition(categoryCreate.status === 201, `Criação de categoria respondeu ${categoryCreate.status}`);

    const categoryDuplicate = await getJson<{ message?: string }>(memberJar, "/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: " teste  padaria ",
        icon: "tag",
        color: "#111111",
        type: "expense",
        monthlyLimit: 0,
        keywords: ""
      })
    });
    assertCondition(categoryDuplicate.status === 409, `Duplicidade de categoria respondeu ${categoryDuplicate.status}`);
    results.push("Categoria duplicada é bloqueada");

    const cardCreate = await getJson<{ id: string }>(memberJar, "/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Visa Teste",
        brand: "visa",
        last4: "1234",
        limitAmount: 3000,
        dueDay: 10,
        closeDay: 3,
        color: "#111111",
        institution: "Itaú"
      })
    });
    assertCondition(cardCreate.status === 201, `Criação de cartão respondeu ${cardCreate.status}`);

    const cardDuplicate = await getJson<{ message?: string }>(memberJar, "/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "  visa   teste ",
        brand: "visa",
        last4: "9999",
        limitAmount: 1500,
        dueDay: 12,
        closeDay: 5,
        color: "#111111",
        institution: "Itaú"
      })
    });
    assertCondition(cardDuplicate.status === 409, `Duplicidade de cartão respondeu ${cardDuplicate.status}`);
    results.push("Cartão duplicado é bloqueado");

    const invalidAmount = await getJson<{ message?: string }>(memberJar, "/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-04-06",
        amount: "abc",
        description: "Padaria",
        type: "expense",
        paymentMethod: "pix",
        accountId: accountCreate.payload.id
      })
    });
    assertCondition(invalidAmount.status === 400, `Valor inválido respondeu ${invalidAmount.status}`);
    results.push("Letras no valor são rejeitadas pela API");

    const bigAmount = await getJson<{ id: string; amount: number }>(memberJar, "/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-04-06",
        amount: 3001,
        description: "Compra grande",
        type: "expense",
        paymentMethod: "pix",
        accountId: accountCreate.payload.id
      })
    });
    assertCondition(bigAmount.status === 201 && bigAmount.payload.amount === 3001, `Valor inteiro não persistiu corretamente`);

    const decimalAmount = await getJson<{ id: string; amount: number }>(memberJar, "/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-04-06",
        amount: 50.23,
        description: "Compra decimal",
        type: "expense",
        paymentMethod: "pix",
        accountId: accountCreate.payload.id
      })
    });
    assertCondition(decimalAmount.status === 201 && decimalAmount.payload.amount === 50.23, `Valor decimal não persistiu corretamente`);
    results.push("Lançamentos aceitam valores inteiros e decimais corretamente");

    const invitationEmail = `convite-${unique}@savepoint.local`;
    const invitationCreate = await getJson<{
      inviteUrl?: string;
      emailDelivery?: { status?: string };
    }>(adminJar, "/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: memberAuditTenant.id,
        email: invitationEmail,
        name: "Pessoa Convidada",
        role: "member",
        planId: premiumPlan.id
      })
    });
    assertCondition(invitationCreate.status === 201, `Criação de convite respondeu ${invitationCreate.status}`);
    assertCondition(invitationCreate.payload.inviteUrl, "Convite não retornou inviteUrl");
    const token = new URL(invitationCreate.payload.inviteUrl!, baseUrl).searchParams.get("token");
    assertCondition(token, "Convite não retornou token no link");

    const mismatchAccept = await fetch(`${baseUrl}/api/auth/accept-invitation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        token,
        name: "Pessoa Convidada",
        password: "Senha123!",
        confirmPassword: "Senha987!"
      })
    });
    const mismatchPayload = (await mismatchAccept.json()) as { message?: string };
    assertCondition(mismatchAccept.status === 400, `Convite com senha divergente respondeu ${mismatchAccept.status}`);
    assertCondition(mismatchPayload.message === "As senhas nao conferem", "Mensagem de validação do convite não voltou corretamente");

    const validAccept = await fetch(`${baseUrl}/api/auth/accept-invitation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        token,
        name: "Pessoa Convidada",
        password: "Senha123!",
        confirmPassword: "Senha123!"
      })
    });
    assertCondition(validAccept.status === 200, `Aceite válido do convite respondeu ${validAccept.status}`);
    const acceptedInvitation = await prisma.invitation.findUniqueOrThrow({
      where: { token: token! },
      select: { kind: true, tenantId: true }
    });
    createdTenantIds.push(acceptedInvitation.tenantId);
    assertCondition(acceptedInvitation.kind === "admin_isolated", "Convite do Admin nao foi criado como carteira isolada");

    const invitedUserJar = await signIn(invitationEmail, "Senha123!");
    const isolatedAccounts = await getJson<{ items: Array<{ id: string }> }>(invitedUserJar, "/api/accounts");
    const isolatedCards = await getJson<{ items: Array<{ id: string }> }>(invitedUserJar, "/api/cards");
    assertCondition(isolatedAccounts.status === 200 && isolatedAccounts.payload.items.length === 0, "Convite do Admin herdou contas indevidamente");
    assertCondition(isolatedCards.status === 200 && isolatedCards.payload.items.length === 0, "Convite do Admin herdou cartoes indevidamente");
    results.push("Convite do Admin exige senha valida e cria carteira isolada vazia");

    const existingUserTenant = await createTenant(`Conta existente ${unique}`, `conta-existente-${unique}`);
    createdTenantIds.push(existingUserTenant.id);
    const existingUser = await createUser({
      tenantId: existingUserTenant.id,
      email: `existente-${unique}@savepoint.local`,
      name: "Pessoa Existente",
      password: "Existente123!"
    });

    const existingInvite = await getJson<{ inviteUrl?: string; message?: string }>(adminJar, "/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: memberAuditTenant.id,
        email: existingUser.email,
        name: "Pessoa Existente",
        role: "member",
        planId: premiumPlan.id
      })
    });
    assertCondition(
      existingInvite.status === 201,
      `Convite para usuário existente respondeu ${existingInvite.status}: ${existingInvite.payload.message ?? "sem mensagem"}`
    );
    const existingToken = new URL(existingInvite.payload.inviteUrl!, baseUrl).searchParams.get("token");
    assertCondition(existingToken, "Token do convite para usuário existente não encontrado");

    const existingAccept = await fetch(`${baseUrl}/api/auth/accept-invitation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        token: existingToken,
        name: "Pessoa Existente",
        password: "NovaSenha123!",
        confirmPassword: "NovaSenha123!"
      })
    });
    const existingAcceptPayload = (await existingAccept.json()) as {
      success?: boolean;
      user?: { linkedExistingAccount?: boolean };
    };
    assertCondition(existingAccept.status === 200, `Aceite para usuário existente respondeu ${existingAccept.status}`);
    assertCondition(
      existingAcceptPayload.user?.linkedExistingAccount === true,
      "Usuario existente nao foi vinculado ao convite administrativo"
    );
    const existingUserAfterAccept = await prisma.user.findUniqueOrThrow({
      where: { id: existingUser.id },
      select: { tenantId: true }
    });
    assertCondition(
      existingUserAfterAccept.tenantId !== memberAuditTenant.id,
      "Usuário existente não foi movido para a conta convidada"
    );
    results.push("Usuario ja existente sem carteira propria entra em carteira isolada pelo Admin");

    createdTenantIds.push(existingUserAfterAccept.tenantId);
    const existingUserJar = await signIn(existingUser.email, "NovaSenha123!");
    const sharedAccounts = await getJson<{ items: Array<{ id: string; name: string }> }>(existingUserJar, "/api/accounts");
    assertCondition(sharedAccounts.status === 200, `Listagem de contas compartilhadas respondeu ${sharedAccounts.status}`);
    assertCondition(
      !sharedAccounts.payload.items.some((item) => item.id === accountCreate.payload.id),
      "Usuario convidado pelo Admin enxergou conta de outra carteira"
    );

    const sharedCards = await getJson<{ items: Array<{ id: string; name: string }> }>(existingUserJar, "/api/cards");
    assertCondition(sharedCards.status === 200, `Listagem de cartões compartilhados respondeu ${sharedCards.status}`);
    assertCondition(
      !sharedCards.payload.items.some((item) => item.id === cardCreate.payload.id),
      "Usuario convidado pelo Admin enxergou cartao de outra carteira"
    );

    const sharedTransactions = await getJson<{ items: Array<{ id: string; description: string }> }>(
      existingUserJar,
      "/api/transactions?limit=20"
    );
    assertCondition(sharedTransactions.status === 200, `Listagem de transações compartilhadas respondeu ${sharedTransactions.status}`);
    assertCondition(
      !sharedTransactions.payload.items.some((item) => item.id === decimalAmount.payload.id),
      "Usuario convidado pelo Admin enxergou transacao de outra carteira"
    );

    const collaboratorAccount = await getJson<{ id: string }>(existingUserJar, "/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Conta conjunta extra",
        type: "checking",
        balance: 25,
        currency: "BRL",
        color: "#111111",
        institution: "Inter"
      })
    });
    assertCondition(collaboratorAccount.status === 201, `Criação de conta pelo colaborador respondeu ${collaboratorAccount.status}`);

    const ownerVisibleAccounts = await getJson<{ items: Array<{ id: string; name: string }> }>(memberJar, "/api/accounts");
    assertCondition(
      !ownerVisibleAccounts.payload.items.some((item) => item.id === collaboratorAccount.payload.id),
      "Titular enxergou conta criada em carteira isolada do convidado"
    );

    const collaboratorGoal = await getJson<{ id: string }>(existingUserJar, "/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Meta compartilhada",
        targetAmount: 1000,
        currentAmount: 120,
        deadline: null,
        color: "#111111",
        icon: "target",
        accountId: collaboratorAccount.payload.id
      })
    });
    assertCondition(collaboratorGoal.status === 201, `Criação de meta compartilhada respondeu ${collaboratorGoal.status}`);

    const ownerGoals = await getJson<{ items: Array<{ id: string; name: string }> }>(memberJar, "/api/goals");
    assertCondition(
      !ownerGoals.payload.items.some((item) => item.id === collaboratorGoal.payload.id),
      "Titular enxergou meta criada em carteira isolada do convidado"
    );
    results.push("Convite administrativo nao compartilha contas, cartoes, transacoes ou metas de outra carteira");

    const blockedUserTenant = await createTenant(`Conta bloqueada ${unique}`, `conta-bloqueada-${unique}`);
    createdTenantIds.push(blockedUserTenant.id);
    const blockedUser = await createUser({
      tenantId: blockedUserTenant.id,
      email: `bloqueado-${unique}@savepoint.local`,
      name: "Pessoa Bloqueada",
      password: "Bloqueada123!"
    });
    await prisma.financialAccount.create({
      data: {
        tenantId: blockedUserTenant.id,
        ownerUserId: blockedUser.id,
        name: `Conta bloqueada ${unique}`,
        type: "checking",
        openingBalance: 50,
        currency: "BRL",
        color: "#111111"
      }
    });

    const blockedInvite = await getJson<{ message?: string }>(adminJar, "/api/admin/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: memberAuditTenant.id,
        email: blockedUser.email,
        name: "Pessoa Bloqueada",
        role: "member",
        planId: premiumPlan.id
      })
    });
    assertCondition(blockedInvite.status === 409, `Convite para usuário com dados próprios respondeu ${blockedInvite.status}`);
    assertCondition(
      typeof blockedInvite.payload.message === "string" &&
        blockedInvite.payload.message.includes("dados financeiros próprios"),
      "Bloqueio de convite para carteira própria não retornou mensagem clara"
    );
    results.push("Usuário com carteira própria não pode ser unido automaticamente a outra conta");

    const deleteTenant = await createTenant(`Conta delete ${unique}`, `conta-delete-${unique}`);
    createdTenantIds.push(deleteTenant.id);
    const deleteUser = await createUser({
      tenantId: deleteTenant.id,
      email: `delete-${unique}@savepoint.local`,
      name: "Pessoa Delete",
      password: "Delete123!"
    });
    const deleteAccount = await prisma.financialAccount.create({
      data: {
        tenantId: deleteTenant.id,
        ownerUserId: deleteUser.id,
        name: `Conta delete ${unique}`,
        type: "checking",
        openingBalance: 120,
        currency: "BRL",
        color: "#111111"
      }
    });
    const deleteCard = await prisma.card.create({
      data: {
        tenantId: deleteTenant.id,
        ownerUserId: deleteUser.id,
        name: `Cartao delete ${unique}`,
        brand: "visa",
        limitAmount: 1000,
        dueDay: 10,
        closeDay: 3,
        color: "#111111"
      }
    });
    const deleteCategory = await prisma.category.findFirstOrThrow({
      where: { tenantId: deleteTenant.id, type: "expense" }
    });
    await prisma.goal.create({
      data: {
        tenantId: deleteTenant.id,
        userId: deleteUser.id,
        accountId: deleteAccount.id,
        name: `Meta delete ${unique}`,
        targetAmount: 500,
        currentAmount: 10,
        color: "#111111"
      }
    });
    await prisma.subscription.create({
      data: {
        tenantId: deleteTenant.id,
        userId: deleteUser.id,
        name: `Assinatura delete ${unique}`,
        amount: 19.9,
        categoryId: deleteCategory.id,
        accountId: deleteAccount.id,
        billingDay: 10,
        nextBillingDate: new Date("2026-04-10T12:00:00Z"),
        isActive: true,
        type: "expense"
      }
    });
    await prisma.transaction.create({
      data: {
        tenantId: deleteTenant.id,
        userId: deleteUser.id,
        date: new Date("2026-04-06T12:00:00Z"),
        amount: 45,
        description: "Transacao delete",
        type: "expense",
        source: "manual",
        paymentMethod: "pix",
        categoryId: deleteCategory.id,
        accountId: deleteAccount.id,
        cardId: deleteCard.id
      }
    });
    await prisma.notificationDelivery.create({
      data: {
        tenantId: deleteTenant.id,
        userId: deleteUser.id,
        channel: "email",
        status: "pending",
        target: deleteUser.email,
        subject: "Teste",
        message: "Teste"
      }
    });
    await prisma.whatsAppMessage.create({
      data: {
        tenantId: deleteTenant.id,
        userId: deleteUser.id,
        direction: "inbound",
        phoneNumber: "+5511999999999",
        body: "Oi"
      }
    });

    const adminDeleteResponse = await adminJar.fetch(`${baseUrl}/api/admin/users/${deleteUser.id}`, {
      method: "DELETE",
      headers: { Accept: "application/json" }
    });
    const adminDeletePayload = (await adminDeleteResponse.json()) as { success?: boolean; message?: string };
    assertCondition(adminDeleteResponse.status === 200 && adminDeletePayload.success, `Exclusão admin respondeu ${adminDeleteResponse.status}`);

    const deletedUserCounts = await Promise.all([
      prisma.user.count({ where: { id: deleteUser.id } }),
      prisma.financialAccount.count({ where: { ownerUserId: deleteUser.id } }),
      prisma.card.count({ where: { ownerUserId: deleteUser.id } }),
      prisma.goal.count({ where: { userId: deleteUser.id } }),
      prisma.subscription.count({ where: { userId: deleteUser.id } }),
      prisma.transaction.count({ where: { userId: deleteUser.id } }),
      prisma.notificationDelivery.count({ where: { userId: deleteUser.id } }),
      prisma.whatsAppMessage.count({ where: { userId: deleteUser.id } })
    ]);
    assertCondition(deletedUserCounts.every((count) => count === 0), "Exclusão admin não removeu todos os dados relacionados");
    results.push("Exclusão definitiva pelo admin remove login e dados relacionados");

    const selfDeleteTenant = await createTenant(`Conta self ${unique}`, `conta-self-${unique}`);
    createdTenantIds.push(selfDeleteTenant.id);
    const selfDeleteUser = await createUser({
      tenantId: selfDeleteTenant.id,
      email: `self-${unique}@savepoint.local`,
      name: "Pessoa Self Delete",
      password: "SelfDelete123!"
    });
    const selfDeleteAccount = await prisma.financialAccount.create({
      data: {
        tenantId: selfDeleteTenant.id,
        ownerUserId: selfDeleteUser.id,
        name: `Conta self ${unique}`,
        type: "checking",
        openingBalance: 80,
        currency: "BRL",
        color: "#111111"
      }
    });
    const selfDeleteCategory = await prisma.category.findFirstOrThrow({
      where: { tenantId: selfDeleteTenant.id, type: "expense" }
    });
    await prisma.transaction.create({
      data: {
        tenantId: selfDeleteTenant.id,
        userId: selfDeleteUser.id,
        date: new Date("2026-04-06T12:00:00Z"),
        amount: 33,
        description: "Transacao self delete",
        type: "expense",
        source: "manual",
        paymentMethod: "pix",
        categoryId: selfDeleteCategory.id,
        accountId: selfDeleteAccount.id
      }
    });

    const selfDeleteJar = await signIn(selfDeleteUser.email, "SelfDelete123!");
    const selfDeleteResponse = await selfDeleteJar.fetch(`${baseUrl}/api/profile`, {
      method: "DELETE",
      headers: { Accept: "application/json" }
    });
    const selfDeletePayload = (await selfDeleteResponse.json()) as { success?: boolean; message?: string };
    assertCondition(selfDeleteResponse.status === 200 && selfDeletePayload.success, `Autoexclusão respondeu ${selfDeleteResponse.status}`);

    const selfDeleteCounts = await Promise.all([
      prisma.user.count({ where: { id: selfDeleteUser.id } }),
      prisma.financialAccount.count({ where: { ownerUserId: selfDeleteUser.id } }),
      prisma.transaction.count({ where: { userId: selfDeleteUser.id } })
    ]);
    assertCondition(selfDeleteCounts.every((count) => count === 0), "Autoexclusão não removeu os dados da própria conta");
    results.push("Autoexclusão remove login e dados do próprio usuário");

    console.log("Runtime regression audit OK");
    for (const item of results) {
      console.log(`- ${item}`);
    }
  } finally {
    if (createdTenantIds.length > 0) {
      await prisma.tenant.deleteMany({
        where: {
          id: {
            in: createdTenantIds
          }
        }
      });
    }

    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error("Runtime regression audit failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
