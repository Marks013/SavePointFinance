import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2];
const force = process.argv.includes("--force");

const templates = {
  "docker-local": {
    source: ".env.local-docker.example",
    target: ".env"
  },
  server: {
    source: ".env.server.example",
    target: ".env"
  }
};

if (!mode || !(mode in templates)) {
  console.log("Usage: node scripts/setup-env.mjs <docker-local|server> [--force]");
  process.exit(1);
}

const { source, target } = templates[mode];
const sourcePath = resolve(process.cwd(), source);
const targetPath = resolve(process.cwd(), target);

if (existsSync(targetPath) && !force) {
  console.log(`[setup-env] ${targetPath} already exists. Use --force to overwrite.`);
  process.exit(0);
}

const randomSecret = () => randomBytes(32).toString("base64url");
const randomPassword = () => randomBytes(18).toString("base64url");

const replacements = new Map([
  ["replace-with-a-long-random-secret", randomSecret()],
  ["replace-with-another-random-secret", randomSecret()],
  ["replace-with-a-strong-admin-password", randomPassword()],
  ["replace-with-a-local-admin-password", randomPassword()],
  ["replace-with-a-strong-postgres-password", randomPassword()],
  ["replace-with-a-long-random-passphrase", randomSecret()],
  ["replace-with-whatsapp-verify-token", randomSecret()]
]);

let content = readFileSync(sourcePath, "utf8");

for (const [placeholder, value] of replacements.entries()) {
  content = content.replaceAll(placeholder, value);
}

writeFileSync(targetPath, content, "utf8");

console.log(`[setup-env] created ${targetPath} from ${source}`);
console.log("[setup-env] review APP URL, AUTH URL and email settings before subir o ambiente.");
