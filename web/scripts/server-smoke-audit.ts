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
const smokeMonth = process.env.SMOKE_MONTH?.trim() || new Date().toISOString().slice(0, 7);

type ProfilePayload = {
  email?: string;
};

type AccountsPayload = {
  items?: Array<{ id: string; name: string }>;
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
  items?: Array<{ id: string; description: string }>;
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
  items?: Array<{ id: string; name: string }>;
};

type ReportsPayload = {
  summary?: {
    balance?: number;
    transactions?: number;
  };
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

type PageExpectation = {
  markers: string[];
  minimumMatches?: number;
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

function normalizeLooseText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function generateEncodingVariants(input: string) {
  const variants = new Set<string>([input]);
  let current = input;

  for (let index = 0; index < 3; index += 1) {
    current = Buffer.from(current, "utf8").toString("latin1");
    variants.add(current);
  }

  current = input;
  for (let index = 0; index < 3; index += 1) {
    current = Buffer.from(current, "latin1").toString("utf8");
    variants.add(current);
  }

  return Array.from(variants);
}

function htmlContainsMarker(html: string, marker: string) {
  const normalizedHtml = normalizeLooseText(html);

  return generateEncodingVariants(marker).some((variant) => {
    const normalizedMarker = normalizeLooseText(variant);
    return normalizedMarker.length > 0 && normalizedHtml.includes(normalizedMarker);
  });
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
  assertCondition(response.ok, `Falha ao carregar sessao: ${response.status}`);
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
  assertCondition(payload.csrfToken, "CSRF token nao encontrado");
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
    "Sessao nao foi estabelecida apos login"
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
  assertCondition(!session?.user?.email, "Sessao continuou ativa apos logout");
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

async function expectPage(jar: CookieJar, path: string, expectation: PageExpectation) {
  const { response, html } = await getHtml(jar, path);
  assertCondition(response.ok, `${path} respondeu ${response.status}`);

  const markers = expectation.markers;
  const minimumMatches = expectation.minimumMatches ?? markers.length;
  const matchedMarkers = markers.filter((marker) => htmlContainsMarker(html, marker));

  assertCondition(
    matchedMarkers.length >= minimumMatches,
    `${path} nao atingiu o minimo de marcadores esperados (${matchedMarkers.length}/${minimumMatches}). Ultimo marcador ausente: ${markers.find((marker) => !matchedMarkers.includes(marker)) ?? "desconhecido"}`
  );
}

async function run() {
  assertCondition(adminEmail, "ADMIN_EMAIL nao definido");
  assertCondition(adminPassword, "ADMIN_PASSWORD nao definida");
  assertCondition(smokeUserEmail, "SMOKE_USER_EMAIL nao definido");
  assertCondition(smokeUserPassword, "SMOKE_USER_PASSWORD nao definida");
  assertCondition(/^\d{4}-\d{2}$/.test(smokeMonth), "SMOKE_MONTH deve estar no formato YYYY-MM");

  const results: string[] = [];

  await expectAnonymousRedirect("/dashboard");
  results.push("Area protegida redireciona para login sem sessao");

  const anonymousLogin = await getHtml(new CookieJar(), "/login");
  assertCondition(anonymousLogin.response.ok, `/login respondeu ${anonymousLogin.response.status}`);
  assertCondition(anonymousLogin.html.includes("Entrar no painel"), "A pagina de login nao exibiu o conteudo esperado");
  results.push("Pagina de login publica responde corretamente");

  const adminJar = await signIn(adminEmail, adminPassword);
  results.push("Login por credenciais estabelece sessao valida");

  await expectPage(adminJar, "/dashboard", {
	  markers: ['aria-label="Encerrar', "Encerrar sessão", "Resumo das contas"],
	  minimumMatches: 2
	});	
  results.push("Dashboard autenticado responde para o admin");

  const adminProfile = await getJson<ProfilePayload>(adminJar, "/api/profile");
  assertCondition(adminProfile.response.ok, `/api/profile respondeu ${adminProfile.response.status}`);
  assertCondition(
    adminProfile.payload.email?.toLowerCase() === adminEmail.toLowerCase(),
    "Perfil autenticado nao corresponde ao admin configurado"
  );
  results.push("API de perfil autenticada respondeu com o admin esperado");

  let dataJar = adminJar;

  if (smokeUserEmail.toLowerCase() !== adminEmail.toLowerCase()) {
    await signOut(adminJar);
    results.push("Logout do admin encerra a sessao");
    await expectAnonymousRedirect("/dashboard");
    results.push("Area protegida volta a exigir autenticacao apos logout do admin");
    dataJar = await signIn(smokeUserEmail, smokeUserPassword);
    results.push("Login do usuario de dados estabelece sessao valida");
  }

  await expectPage(dataJar, "/dashboard", {
    markers: [
	'aria-label="Encerrar'
    "Visão central da operação",
    "Movimento recente",
    "Resumo das contas",
	"Cartões em operação"
    ],
    minimumMatches: 3
  ]);
  results.push("Dashboard principal carregou com conteudo esperado");

  await expectPage(dataJar, "/dashboard/accounts", {
    markers: ['id="account-name"', 'id="account-type"', "Saldo atual total", "Base cadastrada", "Contas"],
	minimumMatches: 3
  ]);
  results.push("Tela de contas carregou com conteudo esperado");

  await expectPage(dataJar, "/dashboard/transactions", {
    markers: [
	  'id="description"',
	  'id="transactions-filter-type"',
	  'id="transactions-filter-limit"',
	  "Receitas filtradas",
	  "Despesas filtradas",
	  "Movimentações recentes"
    ],
	minimumMatches: 4
  ]);
  results.push("Tela de transacoes carregou com conteudo esperado");

  await expectPage(dataJar, "/dashboard/subscriptions", {
    markers: ['id="sub-name"', 'id="sub-type"', "Assinaturas", "Assinaturas ativas", "Entradas mensais"],
    minimumMatches: 3
  ]);
  results.push("Tela de assinaturas carregou com conteudo esperado");

  await expectPage(dataJar, "/dashboard/cards", {
    markers: ['id="card-name"', 'id="statement-card"', 'id="statement-month"', "Central de fatura", "Pagar fatura"],
    minimumMatches: 3
  ]);
  results.push("Tela de cartoes carregou com conteudo esperado");

  await expectPage(dataJar, "/dashboard/reports", {
    markers: [
      'id="reports-period-mode"',
	  'id="reports-filter-type"',
	  "Despesas por categoria","Mapa de categorias",
	  "Mapa de categorias",
	  "Movimentações recentes"
    ],
    minimumMatches: 4
  ]);
  results.push("Tela de relatorios carregou com conteudo esperado");

  await expectPage(dataJar, "/dashboard/settings", {
    markers: [
      'id="settings-name"',
	  'id="settings-email"',
	  'id="settings-whatsapp"',
	  "Automações recorrentes",
	  "Entregas recentes"
    ],
    minimumMatches: 4
  ]);
  results.push("Tela de configuracoes carregou com conteudo esperado");

  await expectPage(dataJar, "/dashboard/goals", [
    "Metas",
    "Metas ativas",
    "Reservado",
    "Objetivo total"
  ]);
  results.push("Tela de metas carregou com conteudo esperado");

  const smokeProfile = await getJson<ProfilePayload>(dataJar, "/api/profile");
  assertCondition(smokeProfile.response.ok, `/api/profile respondeu ${smokeProfile.response.status}`);
  assertCondition(
    smokeProfile.payload.email?.toLowerCase() === smokeUserEmail.toLowerCase(),
    "Perfil autenticado nao corresponde ao usuario de smoke configurado"
  );
  results.push("API de perfil autenticada respondeu com o usuario de smoke esperado");

  const accounts = await getJson<AccountsPayload>(dataJar, "/api/accounts");
  assertCondition(accounts.response.ok, `/api/accounts respondeu ${accounts.response.status}`);
  assertCondition(Array.isArray(accounts.payload.items), "API de contas nao retornou lista de itens");
  results.push("API de contas autenticada respondeu com estrutura valida");

  const cards = await getJson<CardsPayload>(dataJar, "/api/cards");
  assertCondition(cards.response.ok, `/api/cards respondeu ${cards.response.status}`);
  assertCondition(Array.isArray(cards.payload.items), "API de cartoes nao retornou lista de itens");
  results.push("API de cartoes autenticada respondeu com estrutura valida");

  const subscriptions = await getJson<SubscriptionsPayload>(dataJar, "/api/subscriptions");
  assertCondition(subscriptions.response.ok, `/api/subscriptions respondeu ${subscriptions.response.status}`);
  assertCondition(Array.isArray(subscriptions.payload.items), "API de assinaturas nao retornou lista de itens");
  results.push("API de assinaturas autenticada respondeu com estrutura valida");

  const transactions = await getJson<TransactionsPayload>(
    dataJar,
    `/api/transactions?limit=10&month=${smokeMonth}`
  );
  assertCondition(transactions.response.ok, `/api/transactions respondeu ${transactions.response.status}`);
  assertCondition(Array.isArray(transactions.payload.items), "API de transacoes nao retornou lista de itens");
  assertCondition(
    typeof transactions.payload.summary?.totalCount === "number",
    "API de transacoes nao retornou summary.totalCount"
  );
  results.push("API de transacoes autenticada respondeu com totais e itens");

  const reports = await getJson<ReportsPayload>(dataJar, `/api/reports/summary?month=${smokeMonth}`);
  assertCondition(reports.response.ok, `/api/reports/summary respondeu ${reports.response.status}`);
  assertCondition(reports.payload.summary !== undefined, "API de relatorios nao retornou summary");
  assertCondition(Array.isArray(reports.payload.byCategory), "API de relatorios nao retornou categorias");
  results.push("API de relatorios autenticada respondeu com estrutura valida");

  const firstCard = cards.payload.items?.[0];
  if (firstCard?.id) {
    const statementMonth = firstCard.payableStatementMonth ?? firstCard.statementMonth ?? smokeMonth;
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
      "API de fatura do cartao nao retornou summary.transactions"
    );
    results.push("API de fatura do primeiro cartao respondeu com estrutura valida");
  } else {
    results.push("API de fatura do cartao foi ignorada porque nao ha cartoes cadastrados nesse ambiente");
  }

  await signOut(dataJar);
  results.push("Logout encerra a sessao");

  await expectAnonymousRedirect("/dashboard");
  results.push("Area protegida volta a exigir autenticacao apos logout");

  console.log("Server smoke audit OK");
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Admin usado: ${adminEmail}`);
  console.log(`Usuario de dados: ${smokeUserEmail}`);
  console.log(`Mes do smoke: ${smokeMonth}`);
  for (const item of results) {
    console.log(`- ${item}`);
  }
}

run().catch((error) => {
  console.error("Server smoke audit failed");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
