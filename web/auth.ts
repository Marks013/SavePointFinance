import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/auth-config";

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);
