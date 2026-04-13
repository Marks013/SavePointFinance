import * as Sentry from "@sentry/nextjs";

import { ApiRequestError, isExpectedError } from "@/lib/observability/errors";

type AccessScopeInput = {
  id?: string | null;
  tenantId?: string | null;
  role?: string | null;
  isPlatformAdmin?: boolean | null;
  plan?: string | null;
  licenseStatus?: string | null;
};

type CaptureUnexpectedErrorOptions = {
  surface?: string;
  route?: string;
  operation?: string;
  feature?: string;
  requestId?: string | null;
  tenantId?: string | null;
  userId?: string | null;
  role?: string | null;
  isPlatformAdmin?: boolean | null;
  entityId?: string | null;
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
  fingerprint?: string[];
  dedupeKey?: string;
  dedupeWindowMs?: number;
};

type CaptureRequestErrorOptions = Omit<CaptureUnexpectedErrorOptions, "route" | "operation" | "requestId"> & {
  request?: Pick<Request, "url" | "method" | "headers"> | null;
  route?: string;
  operation?: string;
};

const recentClientCaptures = new Map<string, number>();

function buildClientLocation() {
  if (typeof window === "undefined") {
    return null;
  }

  return {
    pathname: window.location.pathname,
    search: window.location.search || null
  };
}

function shouldSkipDuplicateCapture(key: string | undefined, windowMs: number) {
  if (typeof window === "undefined" || !key) {
    return false;
  }

  const now = Date.now();
  const lastSeen = recentClientCaptures.get(key) ?? 0;
  if (now - lastSeen < windowMs) {
    return true;
  }

  recentClientCaptures.set(key, now);
  return false;
}

function setOptionalTag(scope: Sentry.Scope, key: string, value: string | number | boolean | null | undefined) {
  if (value === undefined || value === null || value === "") {
    return;
  }

  scope.setTag(key, String(value));
}

function resolveRequestRoute(request: Pick<Request, "url"> | null | undefined) {
  if (!request?.url) {
    return undefined;
  }

  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

export function syncSentryAccessScope(input: AccessScopeInput | null | undefined) {
  if (!input?.id) {
    Sentry.setUser(null);
    Sentry.setTag("auth_state", "anonymous");
    Sentry.setTag("tenantId", "anonymous");
    Sentry.setTag("role", "guest");
    Sentry.setTag("isPlatformAdmin", "false");
    Sentry.setContext("access", {
      tenantId: null,
      role: null,
      isPlatformAdmin: false,
      plan: null,
      licenseStatus: null
    });
    return;
  }

  Sentry.setUser({
    id: input.id
  });
  Sentry.setTag("auth_state", "authenticated");
  Sentry.setTag("tenantId", input.tenantId ?? "unknown");
  Sentry.setTag("role", input.role ?? "unknown");
  Sentry.setTag("isPlatformAdmin", input.isPlatformAdmin ? "true" : "false");
  Sentry.setContext("access", {
    tenantId: input.tenantId ?? null,
    role: input.role ?? null,
    isPlatformAdmin: Boolean(input.isPlatformAdmin),
    plan: input.plan ?? null,
    licenseStatus: input.licenseStatus ?? null
  });
}

export function captureUnexpectedError(error: unknown, options: CaptureUnexpectedErrorOptions = {}) {
  if (isExpectedError(error)) {
    return;
  }

  if (shouldSkipDuplicateCapture(options.dedupeKey, options.dedupeWindowMs ?? 60_000)) {
    return;
  }

  Sentry.withScope((scope) => {
    setOptionalTag(scope, "surface", options.surface);
    setOptionalTag(scope, "route", options.route);
    setOptionalTag(scope, "operation", options.operation);
    setOptionalTag(scope, "feature", options.feature);
    setOptionalTag(scope, "requestId", options.requestId);
    setOptionalTag(scope, "tenantId", options.tenantId);
    setOptionalTag(scope, "userId", options.userId);
    setOptionalTag(scope, "role", options.role);
    setOptionalTag(scope, "isPlatformAdmin", options.isPlatformAdmin);
    setOptionalTag(scope, "entityId", options.entityId);

    for (const [key, value] of Object.entries(options.tags ?? {})) {
      setOptionalTag(scope, key, value);
    }

    if (error instanceof ApiRequestError) {
      scope.setFingerprint(
        options.fingerprint ?? [
          "{{ default }}",
          error.method ?? "unknown",
          error.path ?? "unknown",
          String(error.status)
        ]
      );
      scope.setContext("request", {
        status: error.status,
        method: error.method ?? null,
        path: error.path ?? null,
        requestId: error.requestId ?? null,
        details: error.details ?? null
      });
    } else if (options.fingerprint?.length) {
      scope.setFingerprint(options.fingerprint);
    }

    const clientLocation = buildClientLocation();
    if (clientLocation) {
      scope.setContext("client_location", clientLocation);
    }

    if (options.extra && Object.keys(options.extra).length > 0) {
      scope.setContext("details", options.extra);
    }

    Sentry.captureException(error);
  });
}

export function captureRequestError(error: unknown, options: CaptureRequestErrorOptions = {}) {
  const route = options.route ?? resolveRequestRoute(options.request);
  const operation = options.operation ?? options.request?.method;
  const requestId = options.request?.headers.get("x-request-id") ?? options.request?.headers.get("x-vercel-id") ?? null;

  captureUnexpectedError(error, {
    ...options,
    surface: options.surface ?? "api",
    route,
    operation,
    requestId,
    extra: {
      ...(options.request?.url ? { url: options.request.url } : {}),
      ...(options.extra ?? {})
    }
  });
}
