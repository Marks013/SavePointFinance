import { requireSessionUser } from "@/lib/auth/session";

export async function requireAdminUser() {
  const user = await requireSessionUser();

  if (user.role !== "admin" && !user.isPlatformAdmin) {
    throw new Error("Forbidden");
  }

  return user;
}
