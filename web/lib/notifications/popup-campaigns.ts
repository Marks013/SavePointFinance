import { type PopupCampaign, type PopupCampaignView, type User } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma/client";

const popupCampaignInputSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome interno para a campanha."),
  status: z.enum(["draft", "active", "paused", "archived"]),
  kind: z.enum(["announcement", "update", "welcome"]),
  tone: z.enum(["calm", "success", "spotlight", "warning"]),
  eyebrow: z.string().trim().max(40).optional().nullable(),
  title: z.string().trim().min(3, "Informe um título claro para o popup."),
  body: z.string().trim().min(12, "Escreva uma mensagem objetiva para o usuário."),
  ctaLabel: z.string().trim().max(32).optional().nullable(),
  ctaUrl: z.string().trim().max(500).optional().nullable(),
  dismissLabel: z.string().trim().max(24).optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  priority: z.number().int().min(0).max(999).default(100),
  delayMs: z.number().int().min(0).max(30000).default(1200),
  autoHideMs: z
    .number()
    .int()
    .min(3000, "Para auto-fechar, use 3 segundos ou mais. Deixe vazio para nunca fechar.")
    .max(60000, "O auto-fechar pode ter no máximo 60 segundos.")
    .optional()
    .nullable(),
  dismissible: z.boolean().default(true),
  oncePerUser: z.boolean().default(true),
  maxViews: z
    .number()
    .int()
    .min(1, "Use um número maior que zero para limitar as exibições.")
    .max(999, "O limite de exibições pode ser no máximo 999. Deixe vazio para não limitar.")
    .optional()
    .nullable(),
  showToNewUsers: z.boolean().default(true),
  showToReturningUsers: z.boolean().default(true),
  showToPlatformAdmins: z.boolean().default(false),
  showToTenantAdmins: z.boolean().default(true),
  showToMembers: z.boolean().default(true),
  targetUserId: z.string().trim().min(1).optional().nullable()
});

const popupCampaignAckSchema = z.object({
  campaignId: z.string().trim().min(1),
  action: z.enum(["view", "dismiss", "cta"])
});

type PopupCampaignRecord = PopupCampaign & {
  _count?: {
    views: number;
  };
};

function mapPopupCampaign(campaign: PopupCampaignRecord) {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    kind: campaign.kind,
    tone: campaign.tone,
    eyebrow: campaign.eyebrow,
    title: campaign.title,
    body: campaign.body,
    ctaLabel: campaign.ctaLabel,
    ctaUrl: campaign.ctaUrl,
    dismissLabel: campaign.dismissLabel,
    startsAt: campaign.startsAt?.toISOString() ?? null,
    endsAt: campaign.endsAt?.toISOString() ?? null,
    priority: campaign.priority,
    delayMs: campaign.delayMs,
    autoHideMs: campaign.autoHideMs,
    dismissible: campaign.dismissible,
    oncePerUser: campaign.oncePerUser,
    maxViews: campaign.maxViews,
    showToNewUsers: campaign.showToNewUsers,
    showToReturningUsers: campaign.showToReturningUsers,
    showToPlatformAdmins: campaign.showToPlatformAdmins,
    showToTenantAdmins: campaign.showToTenantAdmins,
    showToMembers: campaign.showToMembers,
    targetUserId: campaign.targetUserId,
    uniqueViews: campaign._count?.views ?? 0,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString()
  };
}

function parseDateOrNull(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizePopupCampaignInput(input: unknown) {
  const parsed = popupCampaignInputSchema.parse(input);
  const startsAt = parseDateOrNull(parsed.startsAt);
  const endsAt = parseDateOrNull(parsed.endsAt);

  if (startsAt && endsAt && startsAt >= endsAt) {
    throw new Error("A data final precisa ser posterior ao início da campanha.");
  }

  if (parsed.ctaLabel && !parsed.ctaUrl) {
    throw new Error("Informe o link do botão principal.");
  }

  if (parsed.ctaUrl && !/^https?:\/\/|^\//.test(parsed.ctaUrl)) {
    throw new Error("Use um link absoluto com http(s) ou um caminho interno iniciado por '/'.");
  }

  if (!parsed.dismissible && !parsed.ctaLabel) {
    throw new Error("Campanhas sem fechamento manual precisam de um botão principal.");
  }

  return {
    ...parsed,
    eyebrow: normalizeOptionalText(parsed.eyebrow),
    ctaLabel: normalizeOptionalText(parsed.ctaLabel),
    ctaUrl: normalizeOptionalText(parsed.ctaUrl),
    dismissLabel: normalizeOptionalText(parsed.dismissLabel) ?? "Agora não",
    targetUserId: normalizeOptionalText(parsed.targetUserId),
    startsAt,
    endsAt
  };
}

export function getPopupCampaignUserMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    const field = String(issue?.path[0] ?? "");

    if (field === "maxViews") {
      return "O limite de exibições por usuário pode ser no máximo 999. Se preferir, deixe este campo vazio.";
    }

    if (field === "autoHideMs") {
      return "Para auto-fechar, use entre 3 e 60 segundos. Se não quiser auto-fechamento, deixe este campo vazio.";
    }

    if (field === "priority") {
      return "A prioridade deve ficar entre 0 e 999.";
    }

    if (field === "delayMs") {
      return "O atraso do popup precisa ficar entre 0 e 30 segundos.";
    }

    if (field === "title") {
      return "Informe um título curto e claro para o popup.";
    }

    if (field === "body") {
      return "Escreva uma mensagem objetiva para o usuário.";
    }

    if (field === "ctaUrl") {
      return "Use um link interno iniciado por '/' ou um endereço completo com https.";
    }

    return issue?.message ?? fallback;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function parsePopupCampaignAck(input: unknown) {
  return popupCampaignAckSchema.parse(input);
}

export async function listPopupCampaigns() {
  const campaigns = await prisma.popupCampaign.findMany({
    where: {
      targetUserId: null
    },
    include: {
      _count: {
        select: {
          views: true
        }
      }
    },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }]
  });

  return campaigns.map(mapPopupCampaign);
}

export async function createPopupCampaign(input: unknown, actorUserId?: string | null) {
  const data = normalizePopupCampaignInput(input);

  const campaign = await prisma.popupCampaign.create({
    data: {
      ...data,
      createdByUserId: actorUserId ?? null
    },
    include: {
      _count: {
        select: {
          views: true
        }
      }
    }
  });

  return mapPopupCampaign(campaign);
}

export async function updatePopupCampaign(campaignId: string, input: unknown) {
  const data = normalizePopupCampaignInput(input);

  const campaign = await prisma.popupCampaign.update({
    where: {
      id: campaignId
    },
    data,
    include: {
      _count: {
        select: {
          views: true
        }
      }
    }
  });

  return mapPopupCampaign(campaign);
}

export async function deletePopupCampaign(campaignId: string) {
  await prisma.popupCampaign.delete({
    where: {
      id: campaignId
    }
  });
}

function canCampaignTargetRole(campaign: PopupCampaign, user: Pick<User, "role" | "isPlatformAdmin">) {
  if (user.isPlatformAdmin) {
    return campaign.showToPlatformAdmins;
  }

  if (user.role === "admin") {
    return campaign.showToTenantAdmins;
  }

  return campaign.showToMembers;
}

function canCampaignTargetLoginMoment(campaign: PopupCampaign, user: Pick<User, "loginCount">) {
  const isNewUser = user.loginCount <= 1;

  if (isNewUser && !campaign.showToNewUsers) {
    return false;
  }

  if (!isNewUser && !campaign.showToReturningUsers) {
    return false;
  }

  return true;
}

function canCampaignRunNow(campaign: PopupCampaign, now: Date) {
  if (campaign.status !== "active") {
    return false;
  }

  if (campaign.startsAt && campaign.startsAt > now) {
    return false;
  }

  if (campaign.endsAt && campaign.endsAt <= now) {
    return false;
  }

  return true;
}

function canCampaignBeShownByHistory(
  campaign: PopupCampaign,
  view: Pick<PopupCampaignView, "viewCount" | "dismissedAt"> | null
) {
  if (!view) {
    return true;
  }

  if (campaign.oncePerUser && view.viewCount > 0) {
    return false;
  }

  if (typeof campaign.maxViews === "number" && view.viewCount >= campaign.maxViews) {
    return false;
  }

  if (view.dismissedAt && campaign.oncePerUser) {
    return false;
  }

  return true;
}

export async function getActivePopupCampaignForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      id: true,
      role: true,
      isPlatformAdmin: true,
      loginCount: true,
      popupCampaignViews: {
        select: {
          campaignId: true,
          viewCount: true,
          dismissedAt: true
        }
      }
    }
  });

  if (!user) {
    return null;
  }

  const now = new Date();
  const campaigns = await prisma.popupCampaign.findMany({
    where: {
      status: "active",
      OR: [{ targetUserId: null }, { targetUserId: user.id }]
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }]
  });

  const viewMap = new Map(user.popupCampaignViews.map((view) => [view.campaignId, view]));
  const campaign = campaigns.find((item) => {
    if (!canCampaignRunNow(item, now)) {
      return false;
    }

    if (item.targetUserId) {
      return item.targetUserId === user.id && canCampaignBeShownByHistory(item, viewMap.get(item.id) ?? null);
    }

    if (!canCampaignTargetRole(item, user)) {
      return false;
    }

    if (!canCampaignTargetLoginMoment(item, user)) {
      return false;
    }

    return canCampaignBeShownByHistory(item, viewMap.get(item.id) ?? null);
  });

  return campaign ? mapPopupCampaign(campaign) : null;
}

export async function acknowledgePopupCampaign(input: z.infer<typeof popupCampaignAckSchema> & { userId: string }) {
  const now = new Date();

  await prisma.popupCampaignView.upsert({
    where: {
      campaignId_userId: {
        campaignId: input.campaignId,
        userId: input.userId
      }
    },
    create: {
      campaignId: input.campaignId,
      userId: input.userId,
      viewCount: input.action === "view" ? 1 : 0,
      firstSeenAt: input.action === "view" ? now : null,
      lastSeenAt: input.action === "view" ? now : null,
      dismissedAt: input.action === "dismiss" ? now : null,
      clickedAt: input.action === "cta" ? now : null
    },
    update: {
      viewCount: input.action === "view" ? { increment: 1 } : undefined,
      lastSeenAt: input.action === "view" ? now : undefined,
      dismissedAt: input.action === "dismiss" ? now : undefined,
      clickedAt: input.action === "cta" ? now : undefined
    }
  });
}
