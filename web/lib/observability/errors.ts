type ApiRequestErrorInput = {
  message: string;
  status: number;
  method?: string;
  path?: string;
  requestId?: string | null;
  details?: unknown;
};

export class AuthError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export class PermissionError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "PermissionError";
  }
}

export class BusinessRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessRuleError";
  }
}

export class ApiRequestError extends Error {
  status: number;
  method?: string;
  path?: string;
  requestId?: string | null;
  details?: unknown;

  constructor(input: ApiRequestErrorInput) {
    super(input.message);
    this.name = "ApiRequestError";
    this.status = input.status;
    this.method = input.method;
    this.path = input.path;
    this.requestId = input.requestId;
    this.details = input.details;
  }
}

const expectedMessages = new Set([
  "Unauthorized",
  "Forbidden",
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND"
]);

const expectedPrismaCodes = new Set(["P2002", "P2003", "P2025"]);

function hasCode(value: unknown): value is { code: string } {
  return typeof value === "object" && value !== null && "code" in value && typeof value.code === "string";
}

export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError || (error instanceof Error && error.message === "Unauthorized");
}

export function isPermissionError(error: unknown): error is PermissionError {
  return error instanceof PermissionError || (error instanceof Error && error.message === "Forbidden");
}

export function isBusinessRuleError(error: unknown): error is BusinessRuleError {
  return error instanceof BusinessRuleError || (error instanceof Error && error.name === "BusinessRuleError");
}

export function isExpectedError(error: unknown) {
  if (isAuthError(error) || isPermissionError(error) || isBusinessRuleError(error)) {
    return true;
  }

  if (error instanceof ApiRequestError) {
    return error.status < 500;
  }

  if (error instanceof Error) {
    if (expectedMessages.has(error.message)) {
      return true;
    }

    if (error.name === "ZodError" || error.name === "TenantReferenceError") {
      return true;
    }
  }

  if (hasCode(error) && expectedPrismaCodes.has(error.code)) {
    return true;
  }

  return false;
}
