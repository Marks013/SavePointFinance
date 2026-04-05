import NextAuth from "next-auth";

import { baseAuthConfig } from "@/lib/auth/base-config";

export const { auth: middleware } = NextAuth(baseAuthConfig);

export const config = {
  matcher: ["/dashboard/:path*"]
};
