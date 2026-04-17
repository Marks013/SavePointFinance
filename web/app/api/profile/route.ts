import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env/server";
import { getEmailChannelHealth, getWhatsAppChannelHealth } from "@/lib/notifications/channel-health";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { getSharingAuthority } from "@/lib/sharing/access";
import { getAccountPermissionFlags } from "@/lib/users/account-permissions";
import { deleteUserWithAllData } from "@/lib/users/delete-user";
import { formatWhatsAppDisplayPhone, formatWhatsAppPhone } from "@/lib/whatsapp/phone";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const profile = await prisma.user.findUnique({
      where: {
        id: user.id
      },
      include: {
        preferences: true
      }
    });

    if (!profile) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const sharingAuthority = await getSharingAuthority(user);
    const permissions = getAccountPermissionFlags({
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
      canManageSharing: sharingAuthority.canManage
    });
    const emailHealth = getEmailChannelHealth();
    const whatsappHealth = getWhatsAppChannelHealth();

    return NextResponse.json({
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
      tenant: {
        id: user.tenantId,
        name: user.tenant.name
      },
      sharing: {
        canManage: sharingAuthority.canManage
      },
      permissions,
      whatsappNumber: formatWhatsAppDisplayPhone(profile.whatsappNumber),
      license: {
        plan: user.license.plan,
        planLabel: user.license.planLabel,
        status: user.license.status,
        statusLabel: user.license.statusLabel,
        features: user.license.features,
        limits: user.license.effectiveLimits
      },
      integrations: {
        whatsappAssistantEnabled: serverEnv.WHATSAPP_ASSISTANT_ENABLED === "true",
        whatsappConfigured: whatsappHealth.configured,
        whatsappWebhookPath: "/api/integrations/whatsapp/webhook",
        smartClassificationEnabled:
          serverEnv.GEMINI_ENABLED === "true" && Boolean(serverEnv.GEMINI_API_KEY?.trim()),
        emailProvider: emailHealth.provider,
        emailConfigured: emailHealth.configured,
        emailFrom: emailHealth.from,
        emailIssue: emailHealth.issue,
        whatsappIssue: whatsappHealth.issue
      },
      preferences: {
        currency: profile.preferences?.currency ?? "BRL",
        dateFormat: profile.preferences?.dateFormat ?? "DD/MM/YYYY",
        emailNotifications: profile.preferences?.emailNotifications ?? true,
        monthlyReports: profile.preferences?.monthlyReports ?? true,
        budgetAlerts: profile.preferences?.budgetAlerts ?? true,
        dueReminders: profile.preferences?.dueReminders ?? true,
        autoTithe: profile.preferences?.autoTithe ?? false
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "profile" });
    return NextResponse.json({ message: "Failed to load profile" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireSessionUser();
    const profile = await prisma.user.findUnique({
      where: {
        id: user.id
      },
      include: {
        preferences: true
      }
    });

    if (!profile) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const sharingAuthority = await getSharingAuthority(user);
    const permissions = getAccountPermissionFlags({
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
      canManageSharing: sharingAuthority.canManage
    });
    const body = (await request.json()) as {
      name: string;
      whatsappNumber?: string | null;
      preferences: {
        currency: string;
        dateFormat: string;
        emailNotifications: boolean;
        monthlyReports: boolean;
        budgetAlerts: boolean;
        dueReminders: boolean;
        autoTithe: boolean;
      };
    };

    const currentPreferences = {
      currency: profile.preferences?.currency ?? "BRL",
      dateFormat: profile.preferences?.dateFormat ?? "DD/MM/YYYY",
      emailNotifications: profile.preferences?.emailNotifications ?? true,
      monthlyReports: profile.preferences?.monthlyReports ?? true,
      budgetAlerts: profile.preferences?.budgetAlerts ?? true,
      dueReminders: profile.preferences?.dueReminders ?? true,
      autoTithe: profile.preferences?.autoTithe ?? false
    };

    const nextPreferences = {
      currency: permissions.canEditCurrency
        ? body.preferences.currency.trim().toUpperCase()
        : currentPreferences.currency,
      dateFormat: permissions.canEditDateFormat ? body.preferences.dateFormat.trim() : currentPreferences.dateFormat,
      emailNotifications: permissions.canEditEmailNotifications
        ? body.preferences.emailNotifications
        : currentPreferences.emailNotifications,
      monthlyReports: permissions.canEditMonthlyReports
        ? body.preferences.monthlyReports
        : currentPreferences.monthlyReports,
      budgetAlerts: permissions.canEditBudgetAlerts ? body.preferences.budgetAlerts : currentPreferences.budgetAlerts,
      dueReminders: permissions.canEditDueReminders ? body.preferences.dueReminders : currentPreferences.dueReminders,
      autoTithe: permissions.canEditAutoTithe ? body.preferences.autoTithe : currentPreferences.autoTithe
    };

    await prisma.user.update({
      where: {
        id: user.id
      },
      data: {
        name: body.name.trim(),
        whatsappNumber: formatWhatsAppPhone(body.whatsappNumber) || null,
        preferences: {
          upsert: {
            create: nextPreferences,
            update: nextPreferences
          }
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "profile" });
    return NextResponse.json({ message: "Failed to update profile" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireSessionUser();
    const deleted = await deleteUserWithAllData({ userId: user.id });

    return NextResponse.json({
      success: true,
      deletedUser: {
        id: deleted.id,
        email: deleted.email
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "profile" });
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Falha ao excluir a conta"
      },
      { status: 400 }
    );
  }
}
