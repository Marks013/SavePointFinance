import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MAINTENANCE_PATH = "/manutencao";
const ALLOWED_API_PREFIXES = ["/api/health", "/api/integrations"];
const SENSITIVE_SEARCH_PARAMS = ["password", "senha", "token"];

function isAllowedDuringMaintenance(pathname: string) {
  if (pathname === MAINTENANCE_PATH) {
    return true;
  }

  return ALLOWED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function sanitizeSearchParams(searchParams: URLSearchParams) {
  const sanitized = new URLSearchParams(searchParams);

  for (const key of SENSITIVE_SEARCH_PARAMS) {
    sanitized.delete(key);
  }

  const value = sanitized.toString();
  return value ? `?${value}` : "";
}

function hasSensitiveSearchParams(searchParams: URLSearchParams) {
  return SENSITIVE_SEARCH_PARAMS.some((key) => searchParams.has(key));
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isMaintenanceModeEnabled = process.env.MAINTENANCE_MODE === "true";
  const requestHeaders = new Headers(request.headers);
  const sanitizedSearch = sanitizeSearchParams(request.nextUrl.searchParams);

  if (pathname === "/login" && hasSensitiveSearchParams(request.nextUrl.searchParams)) {
    const safeUrl = request.nextUrl.clone();
    safeUrl.search = sanitizedSearch;
    return NextResponse.redirect(safeUrl);
  }

  requestHeaders.set("x-savepoint-pathname", pathname);
  requestHeaders.set("x-savepoint-search", sanitizedSearch);

  if (isMaintenanceModeEnabled && !isAllowedDuringMaintenance(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error: "maintenance_mode",
          message: "A aplicação está temporariamente em manutenção."
        },
        { status: 503 }
      );
    }

    return NextResponse.redirect(new URL(MAINTENANCE_PATH, request.url));
  }

  if (!isMaintenanceModeEnabled && pathname === MAINTENANCE_PATH) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
