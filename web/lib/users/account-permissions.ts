export type AccountPermissionFlags = {
  canAccessAdminPage: boolean;
  canAccessSharingPage: boolean;
  canManageFamilyInvites: boolean;
  canEditName: boolean;
  canEditWhatsAppNumber: boolean;
  canEditEmailNotifications: boolean;
  canEditMonthlyReports: boolean;
  canEditCurrency: boolean;
  canEditDateFormat: boolean;
  canEditBudgetAlerts: boolean;
  canEditDueReminders: boolean;
  canEditAutoTithe: boolean;
};

type AccountPermissionInput = {
  role: "admin" | "member";
  isPlatformAdmin?: boolean;
  canManageSharing?: boolean;
};

export function getAccountPermissionFlags({
  role,
  isPlatformAdmin = false,
  canManageSharing = false
}: AccountPermissionInput): AccountPermissionFlags {
  const canManageAccount = isPlatformAdmin || role === "admin";

  return {
    canAccessAdminPage: canManageAccount,
    canAccessSharingPage: canManageSharing,
    canManageFamilyInvites: canManageSharing,
    canEditName: true,
    canEditWhatsAppNumber: true,
    canEditEmailNotifications: true,
    canEditMonthlyReports: true,
    canEditCurrency: canManageAccount,
    canEditDateFormat: canManageAccount,
    canEditBudgetAlerts: canManageAccount,
    canEditDueReminders: canManageAccount,
    canEditAutoTithe: canManageAccount
  };
}
