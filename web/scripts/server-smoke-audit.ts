import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../.env"), override: false });
loadEnv({ path: resolve(process.cwd(), ".env"), override: false });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: false });

const baseUrl = process.env.AUDIT_BASE_URL?.trim() || "http://127.0.0.1:3000";
const adminEmail = process.env.ADMIN_EMAIL?.trim();
const adminPassword = process.env.ADMIN_PASSWORD?.trim();
const smokeUserEmail = process.env.SMOKE_USER_EMAIL?.trim() || adminEmail;
const smokeUserPassword = process.env.SMOKE_USER_PASSWORD?.trim() || adminPassword;

type ProfilePayload = {
  email?: string;
  tenant?: {
    name?: string;
  };
  preferences?: {
    currency?: string;
  };
};

type AccountsPayload = {
  items?: Array<{
    id: string;
    name: string;
  }>;
};

type CardsPayload = {
  items?: Array<{
    id: string;
    name: string;
    statementMonth?: string;
    payableStatementMonth?: string;
  }>;
};

type TransactionsPayload = {
  items?: Array<{
    id: string;
    description: string;
  }>;
  summary?: {
    totalCount?: number;
    totals?: {
      income?: number;
      expense?: number;
      transfer?: number;
    };
  };
};

type SubscriptionsPayload = {
  items?: Array<{
    id: string;
    name: string;
  }>;
};

type ReportsPayload = {
  summary?: {
    balance?: number;
    transactions?: number;
  };
  monthly?: Array<unknown>;
  byCategory?: Array<unknown>;
};

type CardStatementPayload = {
  month?: string;
  summary?: {
    totalAmount?: number;
    statementOutstandingAmount?: number;
    transactions?: number;
  };
};

class CookieJar {
  private readonly store = new Map<string, string>();

  private updateFromResponse(response: Response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];

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

function formatLocationHeader(response: Response) {
  const location = response.headers.get("location");
  return location ? new URL(location, baseUrl).pathname : null;
}

async function getHtml(jar: CookieJar, path: string) {
  const response = await jar.fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "text/html"
    }
  });

  return {
    response,
    html: await response.text()
  };
}

async function getJson<T>(jar: CookieJar, path: string) {
  const response = await jar.fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json"
    }
  });

  const payload = (await response.json()) as T;
  return { response, payload };
}

async function getSession(jar: CookieJar) {
  const response = await jar.fetch(`${baseUrl}/api/auth/session`, {
    headers: {
      Accept: "application/json"
    }
  });
  assertCondition(response.ok, `Falha ao carregar sessão: ${response.status}`);
  return (await response.json()) as { user?: { email?: string } } | null;
}

async function getCsrfToken(jar: CookieJar) {
  const response = await jar.fetch(`${baseUrl}/api/auth/csrf`, {
    headers: {
      Accept: "application/json"
    }
  });
  assertCondition(response.ok, `Falha ao carregar CSRF: ${response.status}`);
  const payload = (await response.json()) as { csrfToken?: string };
  assertCondition(payload.csrfToken, "CSRF token não encontrado");
  return payload.csrfToken;
}

async function signIn(email: string, password: string) {
  const jar = new CookieJar();
  const csrfToken = await getCsrfToken(jar);
  const form = new URLSearchParams();

  form.set("email", email);
  form.set("password", password);
  form.set("csrfToken", csrfToken);
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

  const session = await getSession(jar);
  assertCondition(
    session?.user?.email?.toLowerCase() === email.toLowerCase(),
    "Sessão não foi estabelecida após login"
  );

  return jar;
}

async function signOut(jar: CookieJar) {
  const csrfToken = await getCsrfToken(jar);
  const form = new URLSearchParams();

  form.set("csrfToken", csrfToken);
  form.set("callbackUrl", `${baseUrl}/`);
  form.set("json", "true");

  const response = await jar.fetch(`${baseUrl}/api/auth/signout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1"
    },
    body: form
  });

  assertCondition(
    response.status === 200 || response.status === 302,
    `Falha no logout: ${response.status}`
  );

  const session = await getSession(jar);
  assertCondition(!session?.user?.email, "Sessão continuou ativa após logout");
}

async function expectAnonymousRedirect(path: string, redirectPath = "/login") {
  const jar = new CookieJar();
  const { response } = await getHtml(jar, path);
  const location = formatLocationHeader(response);

  assertCondition(
    response.status === 302 || response.status === 307,
    `${path} deveria redirecionar, mas respondeu ${response.status}`
  );
  assertCondition(
    location === redirectPath,
    `${path} deveria redirecionar para ${redirectPath}, mas foi para ${location ?? "sem location"}`
  );
}

async function expectPage(
  jar: CookieJar,
  path: string,
  markers: string[]
) {
  const { response, html } = await getHtml(jar, path);
  assertCondition(response.ok, `${path} respondeu ${response.status}`);

  for (const marker of markers) {
    assertCondition(
      html.includes(marker),
      `${path} não contém o marcador esperado: ${marker}`
    );
  }
}

async function run() {
  assertCondition(adminEmail, "ADMIN_EMAIL não definido");
  assertCondition(adminPassword, "ADMIN_PASSWORD não definida");
  assertCondition(smokeUserEmail, "SMOKE_USER_EMAIL não definido");
  assertCondition(smokeUserPassword, "SMOKE_USER_PASSWORD não definida");

  const results: string[] = [];

  await expectAnonymousRedirect("/dashboard");
  results.push("Área protegida redireciona para login sem sessão");

  const anonymousLogin = await getHtml(new CookieJar(), "/login");
  assertCondition(anonymousLogin.response.ok, `/login respondeu ${anonymousLogin.response.status}`);
  assertCondition(
    anonymousLogin.html.includes("Entrar no painel"),
    "A página de login não exibiu o conteúdo esperado"
  );
  results.push("Página de login pública responde corretamente");

  const jar = await signIn(adminEmail, adminPassword);
  results.push("Login por credenciais estabelece sessão válida");

  await expectPage(jar, "/dashboard", [
    "Encerrar sessão"
  ]);
  results.push("Dashboard autenticado responde para o admin");

  const profile = await getJson<ProfilePayload>(jar, "/api/profile");
  assertCondition(profile.response.ok, `/api/profile respondeu ${profile.response.status}`);
  assertCondition(
    profile.payload.email?.toLowerCase() === adminEmail.toLowerCase(),
    "Perfil autenticado não corresponde ao admin configurado"
  );
  results.push("API de perfil autenticada respondeu com o admin esperado");

  if (smokeUserEmail.toLowerCase() !== adminEmail.toLowerCase()) {
    await signOut(jar);
    results.push("Logout do admin encerra a sessão");
    await expectAnonymousRedirect("/dashboard");
    results.push("Área protegida volta a exigir autenticação após logout do admin");
  }

  const dataJar =
    smokeUserEmail.toLowerCase() === adminEmail.toLowerCase() && smokeUserPassword === adminPassword
      ? jar
      : await signIn(smokeUserEmail, smokeUserPassword);

  if (smokeUserEmail.toLowerCase() !== adminEmail.toLowerCase()) {
    results.push("Login do usuário de dados estabelece sessão válida");
  }

  await expectPage(dataJar, "/dashboard", [
    "Visão central da operação",
    "Movimento recente",
    "Resumo das contas",
    "Cartões em operação",
    "Encerrar sessão"
  ]);
  results.push("Dashboard principal carregou com conteúdo esperado");

  await expectPage(dataJar, "/dashboard/accounts", [
    "Contas",
    "Contas disponíveis",
    "Saldo atual total",
    "Base cadastrada"
  ]);
  results.push("Tela de contas carregou com conteúdo esperado");

  await expectPage(dataJar, "/dashboard/transactions", [
    "Operação financeira",
    "Movimentações recentes",
    "Receitas filtradas",
    "Despesas filtradas"
  ]);
  results.push("Tela de transações carregou com conteúdo esperado");

  await expectPage(dataJar, "/dashboard/subscriptions", [
    "Assinaturas",
    "Assinaturas ativas",
    "Saídas mensais",
    "Entradas mensais"
  ]);
  results.push("Tela de assinaturas carregou com conteúdo esperado");

  await expectPage(dataJar, "/dashboard/cards", [
    "Cartões",
    "Cartões ativos",
    "Central de fatura",
    "Acompanhe e pague a competencia certa"
  ]);
  results.push("Tela de cartões carregou com conteúdo esperado");

  await expectPage(dataJar, "/dashboard/reports", [
    "Relatórios",
    "Despesas por categoria",
    "Movimentações recentes",
    "Mapa de categorias"
  ]);
  results.push("Tela de relatórios carregou com conteúdo esperado");

  await expectPage(dataJar, "/dashboard/settings", [
    "Perfil, preferências e rotina",
    "Perfil e preferências",
    "Automações recorrentes",
    "Entregas recentes"
  ]);
  results.push("Tela de configurações carregou com conteúdo esperado");

  await expectPage(dataJar, "/dashboard/goals", [
    "Metas",
    "Metas ativas",
    "Reservado",
    "Objetivo total"
  ]);
  results.push("Tela de metas carregou com conteúdo esperado");

  const smokeProfile = await getJson<ProfilePayload>(dataJar, "/api/profile");
  assertCondition(smokeProfile.response.ok, `/api/profile respondeu ${smokeProfile.response.status}`);
  assertCondition(
    smokeProfile.payload.email?.toLowerCase() === smokeUserEmail.toLowerCase(),
    "Perfil autenticado não corresponde ao usuário de smoke configurado"
  );
  results.push("API de perfil autenticada respondeu com o usuário de smoke esperado");

  const accounts = await getJson<AccountsPayload>(dataJar, "/api/accounts");
  assertCondition(accounts.response.ok, `/api/accounts respondeu ${accounts.response.status}`);
  assertCondition(Array.isArray(accounts.payload.items), "API de contas não retornou lista de itens");
  results.push("API de contas autenticada respondeu com estrutura válida");

  const cards = await getJson<CardsPayload>(dataJar, "/api/cards");
  assertCondition(cards.response.ok, `/api/cards respondeu ${cards.response.status}`);
  assertCondition(Array.isArray(cards.payload.items), "API de cartões não retornou lista de itens");
  results.push("API de cartões autenticada respondeu com estrutura válida");

  const subscriptions = await getJson<SubscriptionsPayload>(dataJar, "/api/subscriptions");
  assertCondition(
    subscriptions.response.ok,
    `/api/subscriptions respondeu ${subscriptions.response.status}`
  );
  assertCondition(Array.isArray(subscriptions.payload.items), "API de assinaturas não retornou lista de itens");
  results.push("API de assinaturas autenticada respondeu com estrutura válida");

  const transactions = await getJson<TransactionsPayload>(dataJar, "/api/transactions?limit=10");
  assertCondition(
    transactions.response.ok,
    `/api/transactions respondeu ${transactions.response.status}`
  );
  assertCondition(Array.isArray(transactions.payload.items), "API de transações não retornou lista de itens");
  assertCondition(
    typeof transactions.payload.summary?.totalCount === "number",
    "API de transações não retornou summary.totalCount"
  );
  results.push("API de transações autenticada respondeu com totais e itens");

  const reports = await getJson<ReportsPayload>(dataJar, "/api/reports/summary?month=2026-04");
  assertCondition(
    reports.response.ok,
    `/api/reports/summary respondeu ${reports.response.status}`
  );
  assertCondition(reports.payload.summary !== undefined, "API de relatórios não retornou summary");
  assertCondition(Array.isArray(reports.payload.byCategory), "API de relatórios não retornou categorias");
  results.push("API de relatórios autenticada respondeu com estrutura válida");

  const firstCard = cards.payload.items?.[0];
  if (firstCard?.id) {
    const statementMonth = firstCard.payableStatementMonth ?? firstCard.statementMonth ?? "2026-04";
    const statement = await getJson<CardStatementPayload>(
      dataJar,
      `/api/cards/${firstCard.id}/statement?month=${statementMonth}&limit=25`
    );

    assertCondition(
      statement.response.ok,
      `/api/cards/${firstCard.id}/statement respondeu ${statement.response.status}`
    );
    assertCondition(
      typeof statement.payload.summary?.transactions === "number",
      "API de fatura do cartão não retornou summary.transactions"
    );
    results.push("API de fatura do primeiro cartão respondeu com estrutura válida");
  } else {
    results.push("API de fatura do cartão foi ignorada porque não há cartões cadastrados nesse ambiente");
  }

  await signOut(dataJar);
  results.push("Logout encerra a sessão");

  await expectAnonymousRedirect("/dashboard");
  results.push("Área protegida volta a exigir autenticação após logout");

  console.log("Server smoke audit OK");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Admin usado: ${adminEmail}`);
  console.log(`Usuário de dados: ${smokeUserEmail}`);
  for (const item of results) {
    console.log(`- ${item}`);
  }
}

run().catch((error) => {
  console.error("Server smoke audit failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
