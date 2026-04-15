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

function pruneHits(hits: number[], cutoff: number) {
  return hits.filter((timestamp) => timestamp > cutoff);
}

export function takeThrottleHit({
  key,
  limit,
  namespace,
  now = Date.now(),
  windowMs
}: ThrottleOptions): ThrottleResult {
  const storeKey = `${namespace}:${key}`;
  const cutoff = now - windowMs;
  const currentState = throttleStore.get(storeKey);
  const hits = pruneHits(currentState?.hits ?? [], cutoff);

  if (hits.length >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(1, windowMs - (now - hits[0]))
    };
  }

  hits.push(now);
  throttleStore.set(storeKey, { hits });

  return {
    allowed: true,
    remaining: Math.max(0, limit - hits.length),
    retryAfterMs: 0
  };
}

export function getClientIpAddress(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
