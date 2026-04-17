export type AppUserRole = "admin" | "member";

type FormatRoleLabelOptions = {
  role: AppUserRole;
  isPlatformAdmin?: boolean;
  accountAdminName?: string | null;
};

export function formatRoleLabel({ role, isPlatformAdmin = false, accountAdminName }: FormatRoleLabelOptions) {
  if (isPlatformAdmin) {
    return "Superadmin";
  }

  if (role === "admin") {
    return "Admin de Conta";
  }

  const normalizedAdminName = accountAdminName?.trim();
  return normalizedAdminName ? `Familiar "${normalizedAdminName}"` : "Familiar";
}

export function formatRoleFilterLabel(role: AppUserRole) {
  return role === "admin" ? "Admins de Conta" : "Familiares";
}
