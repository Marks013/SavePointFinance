import { requireSessionUser } from "@/lib/auth/session";
import { PermissionError } from "@/lib/observability/errors";

type AdminAccessUser = {
  role: "admin" | "member";
  isPlatformAdmin: boolean;
};

export function assertAdminAccess(user: AdminAccessUser) {
  if (user.role !== "admin" && !user.isPlatformAdmin) {
    throw new PermissionError();
  }
}

export async function requireAdminUser() {
  const user = await requireSessionUser();
  assertAdminAccess(user);

  return user;
}
