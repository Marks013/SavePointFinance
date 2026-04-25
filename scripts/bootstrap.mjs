import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2];
const force = process.argv.includes("--force");
const up = process.argv.includes("--up");
const rootDir = process.cwd();
const webDir = resolve(rootDir, "web");
const rootEnvPath = resolve(rootDir, ".env");

const dockerEnvTemplates = {
  "docker-local": ".env.local-docker.example",
  server: ".env.server.example"
};

function printUsage() {
  console.log("Usage:");
  console.log("  node scripts/bootstrap.mjs web-local [--force]");
  console.log("  node scripts/bootstrap.mjs docker-local [--force] [--up]");
  console.log("  node scripts/bootstrap.mjs server [--force] [--up]");
}

function run(command, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, {
      cwd: options.cwd ?? rootDir,
      env: process.env,
      shell: true,
      stdio: "inherit"
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`Command failed: ${command}`));
    });
  });
}

function randomSecret() {
  return randomBytes(32).toString("base64url");
}

function randomPassword() {
  return randomBytes(18).toString("base64url");
}

function buildFallbackRootEnv(modeName) {
  const appUrl = modeName === "server" ? "https://example.com" : "http://localhost:3000";

  return [
    "POSTGRES_DB=savepoint",
    "POSTGRES_USER=savepoint",
    `POSTGRES_PASSWORD=${randomPassword()}`,
    "POSTGRES_PORT=5432",
    "APP_PORT=3000",
    `AUTH_SECRET=${randomSecret()}`,
    `AUTOMATION_CRON_SECRET=${randomSecret()}`,
    `NEXT_PUBLIC_APP_URL=${appUrl}`,
    `AUTH_URL=${appUrl}`,
    "ADMIN_EMAIL=admin@savepoint.local",
    `ADMIN_PASSWORD=${randomPassword()}`,
    "ADMIN_NAME=Administrador SavePoint",
    "ADMIN_TENANT_NAME=SavePoint",
    "ADMIN_TENANT_SLUG=savepoint",
    "GEMINI_ENABLED=false",
    "GEMINI_API_KEY=",
    "GEMINI_MODEL=gemini-1.5-flash",
    "GEMINI_BASE_URL=",
    "EMAIL_PROVIDER=console",
    "EMAIL_FROM=no-reply@savepoint.local",
    "EMAIL_FROM_NAME=SavePoint",
    "EMAIL_REPLY_TO=",
    "RESEND_API_KEY=",
    "BREVO_API_KEY=",
    "NOTIFICATION_EMAIL_WEBHOOK_URL=",
    "NOTIFICATION_WHATSAPP_WEBHOOK_URL=",
    "WHATSAPP_VERIFY_TOKEN=",
    "MAINTENANCE_MODE=false",
    "MP_BILLING_ENABLED=false",
    "MP_ACCESS_TOKEN=",
    "MP_PUBLIC_KEY=",
    "MP_WEBHOOK_SECRET=",
    "MP_BILLING_AMOUNT=29.90",
    "MP_BILLING_ANNUAL_AMOUNT=299.00",
    "MP_BILLING_ANNUAL_MAX_INSTALLMENTS=12",
    "AUDIT_BASE_URL=",
    "SMOKE_MONTH="
  ].join("\n");
}

function getEnvKey(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
    return null;
  }

  return trimmed.slice(0, trimmed.indexOf("="));
}

function mergeExistingEnvValues(nextContent) {
  if (!existsSync(rootEnvPath)) {
    return nextContent;
  }

  const existingLines = readFileSync(rootEnvPath, "utf8").split(/\r?\n/);
  const existingByKey = new Map();

  for (const line of existingLines) {
    const key = getEnvKey(line);

    if (key && !existingByKey.has(key)) {
      existingByKey.set(key, line);
    }
  }

  const seen = new Set();
  const mergedLines = nextContent.split(/\r?\n/).map((line) => {
    const key = getEnvKey(line);

    if (!key) {
      return line;
    }

    seen.add(key);
    return existingByKey.get(key) ?? line;
  });

  for (const line of existingLines) {
    const key = getEnvKey(line);

    if (key && !seen.has(key)) {
      mergedLines.push(line);
    }
  }

  return mergedLines.join("\n").replace(/\n*$/, "\n");
}

function ensureRootEnv(modeName) {
  const templateName = dockerEnvTemplates[modeName];

  if (!templateName) {
    throw new Error(`Unsupported bootstrap mode: ${modeName}`);
  }

  if (existsSync(rootEnvPath) && !force) {
    console.log(`[bootstrap] using existing ${rootEnvPath}`);
    return;
  }

  const templatePath = resolve(rootDir, templateName);

  if (!existsSync(templatePath)) {
    if (existsSync(rootEnvPath)) {
      console.log(`[bootstrap] template ${templateName} not found, keeping existing ${rootEnvPath}`);
      return;
    }

    writeFileSync(rootEnvPath, mergeExistingEnvValues(`${buildFallbackRootEnv(modeName)}\n`), "utf8");
    console.log(`[bootstrap] created ${rootEnvPath} with built-in defaults because ${templateName} is missing`);
    return;
  }

  const replacements = new Map([
    ["replace-with-a-long-random-secret", randomSecret()],
    ["replace-with-another-random-secret", randomSecret()],
    ["replace-with-a-strong-admin-password", randomPassword()],
    ["replace-with-a-local-admin-password", randomPassword()],
    ["replace-with-a-strong-postgres-password", randomPassword()],
    ["replace-with-a-long-random-passphrase", randomSecret()],
    ["replace-with-whatsapp-verify-token", randomSecret()]
  ]);

  let content = readFileSync(templatePath, "utf8");

  for (const [placeholder, value] of replacements.entries()) {
    content = content.replaceAll(placeholder, value);
  }

  writeFileSync(rootEnvPath, mergeExistingEnvValues(content), "utf8");
  console.log(`[bootstrap] created ${rootEnvPath} from ${templateName}`);
}

async function bootstrapWebLocal() {
  await run(`node scripts/init-local-env.mjs${force ? " --force" : ""}`, { cwd: webDir });
  console.log("");
  console.log("[bootstrap] web local pronto.");
  console.log("[bootstrap] Proximo passo: cd web && npm run dev");
}

async function bootstrapDocker(modeName) {
  ensureRootEnv(modeName);

  if (!up) {
    console.log("");
    console.log("[bootstrap] ambiente configurado.");
    console.log("[bootstrap] Para subir tudo:");
    console.log("  docker compose up -d postgres");
    console.log("  docker compose --profile ops run --rm migrate");
    console.log("  docker compose --profile ops run --rm bootstrap-admin");
    console.log("  docker compose up -d web");
    return;
  }

  await run("docker compose up -d postgres");
  await run("docker compose --profile ops run --rm migrate");
  await run("docker compose --profile ops run --rm bootstrap-admin");
  await run("docker compose up -d web");

  console.log("");
  console.log("[bootstrap] stack pronta.");
}

if (!mode || !["web-local", "docker-local", "server"].includes(mode)) {
  printUsage();
  process.exit(1);
}

try {
  if (mode === "web-local") {
    await bootstrapWebLocal();
  } else {
    await bootstrapDocker(mode);
  }
} catch (error) {
  console.error("[bootstrap] failed");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
