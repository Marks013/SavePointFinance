import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { hasSensitiveSearchParams, sanitizeSearchParams } from "@/lib/security/sensitive-url";

const MAINTENANCE_PATH = "/manutencao";
const ALLOWED_API_PREFIXES = ["/api/health", "/api/integrations"];
const INVITATION_TOKEN_COOKIE = "savepoint-invitation-token";
const RESET_TOKEN_COOKIE = "savepoint-reset-token";

function isAllowedDuringMaintenance(pathname: string) {
  if (pathname === MAINTENANCE_PATH) {
    return true;
  }

  return ALLOWED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isSecureRequest(request: NextRequest) {
  return request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isMaintenanceModeEnabled = process.env.MAINTENANCE_MODE === "true";
  const requestHeaders = new Headers(request.headers);
  const sanitizedSearch = sanitizeSearchParams(request.nextUrl.searchParams);
  const token = request.nextUrl.searchParams.get("token")?.trim();

  if ((pathname === "/accept-invitation" || pathname === "/reset-password") && token) {
    const safeUrl = request.nextUrl.clone();
    safeUrl.search = sanitizedSearch;
    const response = NextResponse.redirect(safeUrl);

    response.cookies.set(pathname === "/accept-invitation" ? INVITATION_TOKEN_COOKIE : RESET_TOKEN_COOKIE, token, {
      httpOnly: true,
      maxAge: 10 * 60,
      path: pathname,
      sameSite: "lax",
      secure: isSecureRequest(request)
    });

    return response;
  }

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
