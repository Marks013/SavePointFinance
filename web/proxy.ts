import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { hasSensitiveSearchParams, sanitizeSearchParams } from "@/lib/security/sensitive-url";

const MAINTENANCE_PATH = "/manutencao";
const ALLOWED_API_PREFIXES = ["/api/health", "/api/integrations"];
const MAINTENANCE_BYPASS_HEADER = "x-savepoint-maintenance-bypass";
const INVITATION_TOKEN_COOKIE = "savepoint-invitation-token";
const RESET_TOKEN_COOKIE = "savepoint-reset-token";
const isProduction = process.env.NODE_ENV === "production";

function isAllowedDuringMaintenance(pathname: string) {
  if (pathname === MAINTENANCE_PATH) {
    return true;
  }

  return ALLOWED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function hasMaintenanceBypass(request: NextRequest) {
  const expectedToken = process.env.MAINTENANCE_BYPASS_TOKEN?.trim();

  if (!expectedToken) {
    return false;
  }

  return request.headers.get(MAINTENANCE_BYPASS_HEADER)?.trim() === expectedToken;
}

function isSecureRequest(request: NextRequest) {
  return request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

function createNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let value = "";

  for (const byte of bytes) {
    value += String.fromCharCode(byte);
  }

  return btoa(value);
}

function buildContentSecurityPolicy(nonce: string, options: { allowMercadoPagoCheckout?: boolean } = {}) {
  const mercadoPagoSources =
    "https://sdk.mercadopago.com https://secure-fields.mercadopago.com https://api-static.mercadopago.com https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com https://*.mercadolivre.com https://*.mlstatic.com";
  const scriptElementPolicy = options.allowMercadoPagoCheckout
    ? `script-src-elem 'self' 'unsafe-inline' ${mercadoPagoSources}`
    : `script-src-elem 'self' 'nonce-${nonce}'`;

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `img-src 'self' data: blob: ${mercadoPagoSources}`,
    "font-src 'self' data:",
    isProduction ? `connect-src 'self' ${mercadoPagoSources}` : "connect-src 'self' ws: wss: http: https:",
    `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`,
    scriptElementPolicy,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `frame-src 'self' ${mercadoPagoSources}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    isProduction ? "upgrade-insecure-requests" : ""
  ]
    .filter(Boolean)
    .join("; ");
}

function applySecurityHeaders(response: NextResponse, contentSecurityPolicy: string, request: NextRequest) {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), usb=()");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-site");

  if (isSecureRequest(request)) {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  return response;
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isMaintenanceModeEnabled = process.env.MAINTENANCE_MODE === "true";
  const requestHeaders = new Headers(request.headers);
  const sanitizedSearch = sanitizeSearchParams(request.nextUrl.searchParams);
  const token = request.nextUrl.searchParams.get("token")?.trim();
  const nonce = createNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce, {
    allowMercadoPagoCheckout: pathname === "/billing"
  });

  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

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

    return applySecurityHeaders(response, contentSecurityPolicy, request);
  }

  if (pathname === "/login" && hasSensitiveSearchParams(request.nextUrl.searchParams)) {
    const safeUrl = request.nextUrl.clone();
    safeUrl.search = sanitizedSearch;
    return applySecurityHeaders(NextResponse.redirect(safeUrl), contentSecurityPolicy, request);
  }

  requestHeaders.set("x-savepoint-pathname", pathname);
  requestHeaders.set("x-savepoint-search", sanitizedSearch);

  if (isMaintenanceModeEnabled && !isAllowedDuringMaintenance(pathname) && !hasMaintenanceBypass(request)) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(
        NextResponse.json(
          {
            error: "maintenance_mode",
            message: "A aplicação está temporariamente em manutenção."
          },
          { status: 503 }
        ),
        contentSecurityPolicy,
        request
      );
    }

    return applySecurityHeaders(NextResponse.redirect(new URL(MAINTENANCE_PATH, request.url)), contentSecurityPolicy, request);
  }

  if (!isMaintenanceModeEnabled && pathname === MAINTENANCE_PATH) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/dashboard", request.url)), contentSecurityPolicy, request);
  }

  return applySecurityHeaders(
    NextResponse.next({
      request: {
        headers: requestHeaders
      }
    }),
    contentSecurityPolicy,
    request
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
