import type { NextAuthConfig } from "next-auth";

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getPreferredBaseUrl(baseUrl: string) {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    baseUrl;

  return stripTrailingSlash(configured);
}

export const baseAuthConfig = {
  providers: [],
  pages: {
    signIn: "/login"
  },
  callbacks: {
    redirect({ url, baseUrl }) {
      const preferredBaseUrl = getPreferredBaseUrl(baseUrl);
      const normalizedBaseUrl = stripTrailingSlash(baseUrl);

      if (url.startsWith("/")) {
        return `${preferredBaseUrl}${url}`;
      }

      if (url.startsWith(normalizedBaseUrl)) {
        return `${preferredBaseUrl}${url.slice(normalizedBaseUrl.length)}`;
      }

      if (url.startsWith(preferredBaseUrl)) {
        return url;
      }

      return preferredBaseUrl;
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isProtected = nextUrl.pathname.startsWith("/dashboard");

      if (isProtected) {
        return isLoggedIn;
      }

      if (isLoggedIn && nextUrl.pathname === "/login") {
        return Response.redirect(new URL("/dashboard", nextUrl));
      }

      return true;
    }
  }
} satisfies NextAuthConfig;
