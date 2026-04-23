import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MAINTENANCE_PATH = "/manutencao";
const ALLOWED_API_PREFIXES = ["/api/health", "/api/integrations"];

function isAllowedDuringMaintenance(pathname: string) {
  if (pathname === MAINTENANCE_PATH) {
    return true;
  }

  return ALLOWED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isMaintenanceModeEnabled = process.env.MAINTENANCE_MODE === "true";
  const requestHeaders = new Headers(request.headers);

  requestHeaders.set("x-savepoint-pathname", pathname);
  requestHeaders.set("x-savepoint-search", request.nextUrl.search);

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
