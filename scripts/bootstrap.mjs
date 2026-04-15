import { spawn } from "node:child_process";
import { resolve } from "node:path";

const mode = process.argv[2];
const force = process.argv.includes("--force");
const up = process.argv.includes("--up");
const rootDir = process.cwd();
const webDir = resolve(rootDir, "web");

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

async function bootstrapWebLocal() {
  await run(`node scripts/init-local-env.mjs${force ? " --force" : ""}`, { cwd: webDir });
  console.log("");
  console.log("[bootstrap] web local pronto.");
  console.log("[bootstrap] Proximo passo: cd web && npm run dev");
}

async function bootstrapDocker(modeName) {
  await run(`node scripts/setup-env.mjs ${modeName}${force ? " --force" : ""}`);

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
