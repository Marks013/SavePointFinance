import pg from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  DATABASE_URL,
  ADMIN_EMAIL = "admin@savepoint.local",
  ADMIN_PASSWORD,
  ADMIN_NAME = "Administrador SavePoint",
  ADMIN_TENANT_NAME = "SavePoint",
  ADMIN_TENANT_SLUG = "savepoint"
} = process.env;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

if (!ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD is required.");
}

async function ensureSchemaExists(client) {
  const result = await client.query('SELECT to_regclass(\'public."Tenant"\') AS "tenantTable"');
  if (!result.rows[0]?.tenantTable) {
    throw new Error('Schema not initialized. Run "prisma migrate deploy" before bootstrapping the admin.');
  }
}

async function ensureAdmin(client) {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await client.query(
    `
      INSERT INTO "Tenant" ("id", "name", "slug", "plan", "maxUsers", "isActive", "trialDays", "createdAt", "updatedAt")
      VALUES ('tenant-bootstrap', $1, $2, 'pro', 5, true, 31, NOW(), NOW())
      ON CONFLICT ("slug")
      DO UPDATE SET
        "name" = EXCLUDED."name",
        "isActive" = true,
        "updatedAt" = NOW()
    `,
    [ADMIN_TENANT_NAME, ADMIN_TENANT_SLUG]
  );

  const tenantResult = await client.query('SELECT "id" FROM "Tenant" WHERE "slug" = $1 LIMIT 1', [ADMIN_TENANT_SLUG]);
  const tenantId = tenantResult.rows[0]?.id;

  if (!tenantId) {
    throw new Error("Unable to resolve tenant.");
  }

  await client.query(
    `
      INSERT INTO "User" (
        "id", "tenantId", "email", "name", "passwordHash", "role", "isPlatformAdmin", "isActive", "loginCount", "createdAt", "updatedAt"
      )
      VALUES ('user-bootstrap-admin', $1, $2, $3, $4, 'admin', true, true, 0, NOW(), NOW())
      ON CONFLICT ("email")
      DO UPDATE SET
        "tenantId" = EXCLUDED."tenantId",
        "name" = EXCLUDED."name",
        "passwordHash" = EXCLUDED."passwordHash",
        "role" = 'admin',
        "isPlatformAdmin" = true,
        "isActive" = true,
        "updatedAt" = NOW()
    `,
    [tenantId, ADMIN_EMAIL, ADMIN_NAME, passwordHash]
  );

  const userResult = await client.query('SELECT "id" FROM "User" WHERE "email" = $1 LIMIT 1', [ADMIN_EMAIL]);
  const userId = userResult.rows[0]?.id;

  if (!userId) {
    throw new Error("Unable to resolve admin user.");
  }

  await client.query(
    `
      INSERT INTO "UserPreference" ("id", "userId", "createdAt", "updatedAt")
      VALUES ('pref-bootstrap-admin', $1, NOW(), NOW())
      ON CONFLICT ("userId") DO NOTHING
    `,
    [userId]
  );

  await client.query(
    `
      INSERT INTO "FinancialAccount" (
        "id", "tenantId", "ownerUserId", "name", "type", "balance", "currency", "color", "isActive", "createdAt", "updatedAt"
      )
      SELECT
        'account-bootstrap-main',
        $1,
        "id",
        'Conta Principal',
        'checking',
        0,
        'BRL',
        '#10B981',
        true,
        NOW(),
        NOW()
      FROM "User"
      WHERE "email" = $2
      LIMIT 1
      ON CONFLICT ("id")
      DO UPDATE SET
        "tenantId" = EXCLUDED."tenantId",
        "ownerUserId" = EXCLUDED."ownerUserId",
        "name" = EXCLUDED."name",
        "type" = EXCLUDED."type",
        "currency" = EXCLUDED."currency",
        "color" = EXCLUDED."color",
        "isActive" = true,
        "updatedAt" = NOW()
    `,
    [tenantId, ADMIN_EMAIL]
  );

  const defaultsPath = path.resolve(__dirname, "../lib/finance/default-categories.json");
  const defaultCategories = JSON.parse(await readFile(defaultsPath, "utf8"));
  const categoryRows = await client.query(
    'SELECT "id", "name", "type", "createdAt" FROM "Category" WHERE "tenantId" = $1 ORDER BY "createdAt" ASC, "id" ASC',
    [tenantId]
  );
  const groupedCategories = new Map();

  for (const row of categoryRows.rows) {
    const key = `${String(row.type)}:${String(row.name).trim().toLowerCase()}`;
    const current = groupedCategories.get(key) ?? [];
    current.push(row);
    groupedCategories.set(key, current);
  }

  for (const duplicates of groupedCategories.values()) {
    if (duplicates.length < 2) {
      continue;
    }

    const redundantIds = duplicates.slice(1).map((row) => row.id);

    await client.query('UPDATE "Transaction" SET "categoryId" = $1 WHERE "tenantId" = $2 AND "categoryId" = ANY($3::text[])', [
      duplicates[0].id,
      tenantId,
      redundantIds
    ]);
    await client.query('UPDATE "Transaction" SET "titheCategoryId" = $1 WHERE "tenantId" = $2 AND "titheCategoryId" = ANY($3::text[])', [
      duplicates[0].id,
      tenantId,
      redundantIds
    ]);
    await client.query('UPDATE "Subscription" SET "categoryId" = $1 WHERE "tenantId" = $2 AND "categoryId" = ANY($3::text[])', [
      duplicates[0].id,
      tenantId,
      redundantIds
    ]);
    await client.query('DELETE FROM "Category" WHERE "tenantId" = $1 AND "id" = ANY($2::text[])', [
      tenantId,
      redundantIds
    ]);
  }

  const existingCategories = await client.query(
    'SELECT "name", "type" FROM "Category" WHERE "tenantId" = $1',
    [tenantId]
  );
  const existingKeys = new Set(
    existingCategories.rows.map((row) => `${row.type}:${String(row.name).toLowerCase()}`)
  );

  for (const category of defaultCategories) {
    const key = `${category.type}:${String(category.name).toLowerCase()}`;
    if (existingKeys.has(key)) {
      continue;
    }

    await client.query(
      `
        INSERT INTO "Category" (
          "id", "tenantId", "name", "icon", "color", "type", "keywords", "isDefault", "createdAt"
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8, NOW())
      `,
      [
        randomUUID(),
        tenantId,
        category.name,
        category.icon,
        category.color,
        category.type,
        category.keywords,
        true
      ]
    );
  }
}

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    await ensureSchemaExists(client);
    await ensureAdmin(client);
    console.log(`[bootstrap-admin] ensured ${ADMIN_EMAIL}`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[bootstrap-admin] failed", error);
  process.exit(1);
});
