import { ApiRequestError } from "@/lib/observability/errors";

type EnsureApiResponseOptions = {
  fallbackMessage: string;
  method?: string;
  path?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readErrorPayload(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");
  return text ? { message: text } : null;
}

function resolveErrorMessage(payload: unknown, fallbackMessage: string) {
  if (isRecord(payload) && typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  return fallbackMessage;
}

function resolveRequestPath(response: Response, fallbackPath?: string) {
  if (fallbackPath) {
    return fallbackPath;
  }

  try {
    return new URL(response.url).pathname;
  } catch {
    return response.url || undefined;
  }
}

export async function ensureApiResponse(response: Response, options: EnsureApiResponseOptions) {
  if (response.ok) {
    return response;
  }

  const payload = await readErrorPayload(response);
  throw new ApiRequestError({
    message: resolveErrorMessage(payload, options.fallbackMessage),
    status: response.status,
    method: options.method ?? undefined,
    path: resolveRequestPath(response, options.path),
    requestId: response.headers.get("x-request-id"),
    details: payload
  });
}
