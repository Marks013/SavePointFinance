import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role?: string;
      tenantId?: string;
      isPlatformAdmin?: boolean;
      previousLastLogin?: string | null;
    };
  }

  interface User {
    role?: string;
    tenantId?: string;
    isPlatformAdmin?: boolean;
    previousLastLogin?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    tenantId?: string;
    isPlatformAdmin?: boolean;
    previousLastLogin?: string | null;
  }
}
