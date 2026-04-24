const SENSITIVE_PARAM_FRAGMENTS = ["password", "senha", "token", "secret"];
const SENSITIVE_PARAM_EXACT = new Set([
  "code",
  "credential",
  "credentials",
  "pass",
  "pwd"
]);
const NESTED_URL_PARAM_NAMES = new Set(["callbackurl", "redirect", "redirectto", "returnto", "next"]);

function normalizeParamName(name: string) {
  return name.toLowerCase().replace(/[\s_.-]+/g, "");
}

export function isSensitiveSearchParamName(name: string) {
  const normalized = normalizeParamName(name);
  return SENSITIVE_PARAM_EXACT.has(normalized) || SENSITIVE_PARAM_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

function sanitizeNestedUrlValue(value: string) {
  if (!value.includes("?") && !value.includes("%3F")) {
    return value;
  }

  try {
    const url = new URL(value, "https://savepoint.local");
    const sanitizedSearch = sanitizeSearchParams(url.searchParams);
    url.search = sanitizedSearch;

    if (/^https?:\/\//i.test(value)) {
      return url.toString();
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

export function sanitizeSearchParams(searchParams: URLSearchParams) {
  const sanitized = new URLSearchParams();

  for (const [key, value] of searchParams.entries()) {
    if (isSensitiveSearchParamName(key)) {
      continue;
    }

    const normalizedKey = normalizeParamName(key);
    sanitized.append(key, NESTED_URL_PARAM_NAMES.has(normalizedKey) ? sanitizeNestedUrlValue(value) : value);
  }

  const value = sanitized.toString();
  return value ? `?${value}` : "";
}

export function sanitizeSearch(value: string | URLSearchParams | null | undefined) {
  if (!value) {
    return null;
  }

  const sanitized = sanitizeSearchParams(value instanceof URLSearchParams ? value : new URLSearchParams(value));
  return sanitized || null;
}

export function hasSensitiveSearchParams(searchParams: URLSearchParams) {
  for (const [key, value] of searchParams.entries()) {
    if (isSensitiveSearchParamName(key)) {
      return true;
    }

    const normalizedKey = normalizeParamName(key);
    if (!NESTED_URL_PARAM_NAMES.has(normalizedKey)) {
      continue;
    }

    if (sanitizeNestedUrlValue(value) !== value) {
      return true;
    }
  }

  return false;
}
