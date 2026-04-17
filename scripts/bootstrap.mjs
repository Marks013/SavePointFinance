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

    throw new Error(
      `[bootstrap] ${rootEnvPath} not found and template ${templateName} is missing. ` +
        "Crie o arquivo .env manualmente antes de usar o bootstrap."
    );
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

  writeFileSync(rootEnvPath, content, "utf8");
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
