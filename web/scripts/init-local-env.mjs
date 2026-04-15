import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const force = process.argv.includes("--force");
const sourcePath = resolve(process.cwd(), ".env.example");
const targetPath = resolve(process.cwd(), ".env.local");

if (existsSync(targetPath) && !force) {
  console.log(`[env:init] ${targetPath} already exists. Use --force to overwrite.`);
  process.exit(0);
}

const randomSecret = () => randomBytes(32).toString("base64url");

const content = readFileSync(sourcePath, "utf8")
  .replace("AUTH_SECRET=replace-me-local-dev", `AUTH_SECRET=${randomSecret()}`)
  .replace("AUTOMATION_CRON_SECRET=replace-me-local-dev", `AUTOMATION_CRON_SECRET=${randomSecret()}`);

writeFileSync(targetPath, content, "utf8");

console.log(`[env:init] created ${targetPath}`);
console.log("[env:init] review DATABASE_URL if your local Postgres is not on localhost:5433.");
