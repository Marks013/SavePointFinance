import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma/client";
import { serverEnv } from "@/lib/env/server";

type ThrottleState = {
  hits: number[];
};

type ThrottleOptions = {
  key: string;
  limit: number;
  namespace: string;
  now?: number;
  windowMs: number;
};

type ThrottleResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

declare global {
  var savePointThrottleStore: Map<string, ThrottleState> | undefined;
}

const throttleStore = global.savePointThrottleStore ?? new Map<string, ThrottleState>();

if (!global.savePointThrottleStore) {
  global.savePointThrottleStore = throttleStore;
}

const MAX_DB_RETRIES = 3;

function buildStoreKey(namespace: string, key: string) {
  return `${namespace}:${key}`;
}

function normalizeHits(raw: unknown, cutoff: number) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const hits: number[] = [];

  for (const value of raw) {
    if (typeof value === "number" && Number.isFinite(value) && value > cutoff) {
      hits.push(value);
    }
  }

  return hits.sort((left, right) => left - right);
}

function getRetryAfterMs(hits: number[], now: number, windowMs: number) {
  const oldestHit = hits[0];
  return oldestHit ? Math.max(1, windowMs - (now - oldestHit)) : windowMs;
}

function buildThrottleResult(hits: number[], limit: number, now: number, windowMs: number): ThrottleResult {
  if (hits.length >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: getRetryAfterMs(hits, now, windowMs)
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, limit - hits.length),
    retryAfterMs: 0
  };
}

function peekInMemoryThrottle({
  key,
  limit,
  namespace,
  now = Date.now(),
  windowMs
}: ThrottleOptions): ThrottleResult {
  const storeKey = buildStoreKey(namespace, key);
  const cutoff = now - windowMs;
  const currentState = throttleStore.get(storeKey);
  const hits = normalizeHits(currentState?.hits, cutoff);

  return buildThrottleResult(hits, limit, now, windowMs);
}

function applyInMemoryThrottle({
  key,
  limit,
  namespace,
  now = Date.now(),
  windowMs
}: ThrottleOptions): ThrottleResult {
  const storeKey = buildStoreKey(namespace, key);
  const cutoff = now - windowMs;
  const currentState = throttleStore.get(storeKey);
  const hits = normalizeHits(currentState?.hits, cutoff);

  const currentResult = buildThrottleResult(hits, limit, now, windowMs);

  if (!currentResult.allowed) {
    return currentResult;
  }

  hits.push(now);
  throttleStore.set(storeKey, { hits });

  return buildThrottleResult(hits, limit, now, windowMs);
}

function isRetryableThrottleError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2034")
  );
}

export async function takeThrottleHit({
  key,
  limit,
  namespace,
  now = Date.now(),
  windowMs
}: ThrottleOptions): Promise<ThrottleResult> {
  const normalizedKey = key.trim();

  if (!normalizedKey) {
    return {
      allowed: true,
      remaining: limit,
      retryAfterMs: 0
    };
  }

  for (let attempt = 0; attempt < MAX_DB_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const cutoff = now - windowMs;
          const [existing] = await tx.$queryRaw<Array<{ id: string; hits: Prisma.JsonValue | null }>>`
            SELECT "id", "hits"
            FROM "RequestThrottle"
            WHERE "namespace" = ${namespace} AND "key" = ${normalizedKey}
            LIMIT 1
          `;

          const hits = normalizeHits(existing?.hits, cutoff);

          if (hits.length >= limit) {
            if (existing) {
              await tx.$executeRaw`
                UPDATE "RequestThrottle"
                SET "hits" = CAST(${JSON.stringify(hits)} AS jsonb),
                    "windowMs" = ${windowMs},
                    "updatedAt" = NOW()
                WHERE "id" = ${existing.id}
              `;
            }

            return {
              allowed: false,
              remaining: 0,
              retryAfterMs: getRetryAfterMs(hits, now, windowMs)
            };
          }

          hits.push(now);

          if (existing) {
            await tx.$executeRaw`
              UPDATE "RequestThrottle"
              SET "hits" = CAST(${JSON.stringify(hits)} AS jsonb),
                  "windowMs" = ${windowMs},
                  "updatedAt" = NOW()
              WHERE "id" = ${existing.id}
            `;
          } else {
            await tx.$executeRaw`
              INSERT INTO "RequestThrottle" (
                "id",
                "namespace",
                "key",
                "hits",
                "windowMs",
                "createdAt",
                "updatedAt"
              )
              VALUES (
                ${randomUUID()},
                ${namespace},
                ${normalizedKey},
                CAST(${JSON.stringify(hits)} AS jsonb),
                ${windowMs},
                NOW(),
                NOW()
              )
            `;
          }

          return {
            allowed: true,
            remaining: Math.max(0, limit - hits.length),
            retryAfterMs: 0
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );
    } catch (error) {
      if (!isRetryableThrottleError(error) || attempt === MAX_DB_RETRIES - 1) {
        return applyInMemoryThrottle({
          key: normalizedKey,
          limit,
          namespace,
          now,
          windowMs
        });
      }
    }
  }

  return applyInMemoryThrottle({
    key: normalizedKey,
    limit,
    namespace,
    now,
    windowMs
  });
}

export async function peekThrottleState({
  key,
  limit,
  namespace,
  now = Date.now(),
  windowMs
}: ThrottleOptions): Promise<ThrottleResult> {
  const normalizedKey = key.trim();

  if (!normalizedKey) {
    return {
      allowed: true,
      remaining: limit,
      retryAfterMs: 0
    };
  }

  for (let attempt = 0; attempt < MAX_DB_RETRIES; attempt += 1) {
    try {
      const [existing] = await prisma.$queryRaw<Array<{ hits: Prisma.JsonValue | null }>>`
        SELECT "hits"
        FROM "RequestThrottle"
        WHERE "namespace" = ${namespace} AND "key" = ${normalizedKey}
        LIMIT 1
      `;

      const cutoff = now - windowMs;
      const hits = normalizeHits(existing?.hits, cutoff);
      return buildThrottleResult(hits, limit, now, windowMs);
    } catch (error) {
      if (!isRetryableThrottleError(error) || attempt === MAX_DB_RETRIES - 1) {
        return peekInMemoryThrottle({
          key: normalizedKey,
          limit,
          namespace,
          now,
          windowMs
        });
      }
    }
  }

  return peekInMemoryThrottle({
    key: normalizedKey,
    limit,
    namespace,
    now,
    windowMs
  });
}

export function getClientIpAddress(request: Request) {
  if (serverEnv.AUTH_TRUST_HOST !== "true") {
    return null;
  }

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || null;
}
