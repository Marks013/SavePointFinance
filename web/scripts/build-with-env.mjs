import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const buildEnv = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL?.trim() || "postgresql://savepoint:savepoint@127.0.0.1:5432/savepoint",
  AUTH_SECRET: process.env.AUTH_SECRET?.trim() || "build-only-secret",
  AUTOMATION_CRON_SECRET: process.env.AUTOMATION_CRON_SECRET?.trim() || "build-only-secret"
};

const nextBin = resolve(__dirname, "../node_modules/next/dist/bin/next");
const nextBuildDir = resolve(__dirname, "../.next");

rmSync(nextBuildDir, {
  force: true,
  recursive: true
});

const child = spawn(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: buildEnv
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
