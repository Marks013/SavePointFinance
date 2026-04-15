import { requireSessionUser } from "@/lib/auth/session";
import { PermissionError } from "@/lib/observability/errors";

export async function requireAdminUser() {
  const user = await requireSessionUser();

  if (user.role !== "admin" && !user.isPlatformAdmin) {
    throw new PermissionError();
  }

  return user;
}
