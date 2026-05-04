import { NotificationChannel, type Prisma } from "@prisma/client";

import { logAdminAudit } from "@/lib/admin/audit";
import { deliverNotification } from "@/lib/notifications/delivery";
import { prisma } from "@/lib/prisma/client";

const DAY_MS = 24 * 60 * 60 * 1000;
const WARNING_PREFIX = "SavePoint: retenção de conta";
const RETENTION_POLICY_KEY = "retention.policy";

type RetentionReason = "inactivity" | "trial_nonpayment";
type RetentionStage = 1 | 2 | 3;

export type RetentionPolicy = {
  enabled: boolean;
  firstWarningDays: number;
  secondWarningDays: number;
  closureDays: number;
  enabledAt: string | null;
  graceUntil: string | null;
};

type RetentionTenant = Prisma.TenantGetPayload<{
  include: {
    planConfig: {
      select: {
        id: true;
        name: true;
        slug: true;
        tier: true;
        trialDays: true;
      };
    };
    users: {
      select: {
        id: true;
        email: true;
        name: true;
        role: true;
        isActive: true;
        isPlatformAdmin: true;
        lastLogin: true;
        createdAt: true;
      };
    };
    billingSubscriptions: {
      select: {
        id: true;
        status: true;
      };
    };
  };
}>;

type RetentionRecipient = {
  id: string;
  email: string;
  name: string;
};

type RetentionActor = {
  id: string;
  tenantId: string;
} | null;

export type RetentionStats = {
  inactiveAccounts30: number;
  inactiveAccounts60: number;
  inactiveAccountsClosure: number;
  trialNonPayment30: number;
  trialNonPayment60: number;
  trialNonPaymentClosure: number;
  closureDue: number;
  warningEmailsLast30Days: number;
  lastRunAt: string | null;
  lastRunSummary: string | null;
  protectedDuringGrace: number;
  policy: RetentionPolicy;
};

export type RetentionRunResult = {
  dryRun: boolean;
  scannedTenants: number;
  warningsPlanned: number;
  warningsSent: number;
  skippedWarnings: number;
  inactiveAccountsWarned: number;
  inactiveAccountsClosed: number;
  trialAccountsWarned: number;
  trialAccountsClosed: number;
  closedTenants: Array<{
    id: string;
    name: string;
    reason: RetentionReason;
  }>;
};

function subtractDays(date: Date, days: number) {
  return new Date(date.getTime() - days * DAY_MS);
}

function daysSince(now: Date, date: Date) {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

function defaultRetentionPolicy(): RetentionPolicy {
  return {
    enabled: true,
    firstWarningDays: 30,
    secondWarningDays: 60,
    closureDays: 90,
    enabledAt: null,
    graceUntil: null
  };
}

function normalizeRetentionPolicy(value: unknown): RetentionPolicy {
  const fallback = defaultRetentionPolicy();

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const candidate = value as Partial<RetentionPolicy>;
  const closureDays =
    typeof candidate.closureDays === "number" && Number.isFinite(candidate.closureDays)
      ? Math.max(90, Math.floor(candidate.closureDays))
      : fallback.closureDays;

  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : fallback.enabled,
    firstWarningDays: fallback.firstWarningDays,
    secondWarningDays: Math.min(fallback.secondWarningDays, closureDays),
    closureDays,
    enabledAt: typeof candidate.enabledAt === "string" ? candidate.enabledAt : null,
    graceUntil: typeof candidate.graceUntil === "string" ? candidate.graceUntil : null
  };
}

function resolveStage(days: number, policy: RetentionPolicy): RetentionStage | null {
  if (!policy.enabled) return null;
  if (days >= policy.closureDays) return 3;
  if (days >= policy.secondWarningDays) return 2;
  if (days >= policy.firstWarningDays) return 1;
  return null;
}

function isClosureProtectedByGrace(now: Date, policy: RetentionPolicy) {
  if (!policy.enabled || !policy.graceUntil) {
    return false;
  }

  const graceUntil = new Date(policy.graceUntil);
  return !Number.isNaN(graceUntil.getTime()) && graceUntil.getTime() > now.getTime();
}

function subjectFor(reason: RetentionReason, stage: RetentionStage) {
  const label = reason === "inactivity" ? "inatividade" : "trial Pro sem pagamento";
  return `${WARNING_PREFIX}: ${label} (${stage}/3)`;
}

function messageFor(input: {
  tenantName: string;
  recipientName: string;
  reason: RetentionReason;
  stage: RetentionStage;
  days: number;
}) {
  const greeting = `Oi, ${input.recipientName}!`;
  const stageCopy =
    input.stage === 3
      ? "Este é o 3º aviso. A conta será encerrada de forma definitiva e os dados serão removidos."
      : `Este é o aviso ${input.stage}/3. Você ainda pode entrar na conta para manter tudo ativo.`;

  if (input.reason === "trial_nonpayment") {
    return [
      greeting,
      "",
      `A avaliação Pro da conta "${input.tenantName}" venceu há ${input.days} dias e não identificamos uma assinatura ativa.`,
      stageCopy,
      "",
      "Se quiser continuar usando o SavePoint, acesse sua conta e finalize a assinatura pelo checkout."
    ].join("\n");
  }

  return [
    greeting,
    "",
    `A conta "${input.tenantName}" está sem acesso há ${input.days} dias.`,
    stageCopy,
    "",
    "Se foi só uma pausa estratégica, tudo bem: basta entrar novamente para zerar esse alerta."
  ].join("\n");
}

function latestAccountActivity(tenant: RetentionTenant) {
  const timestamps = tenant.users
    .filter((user) => !user.isPlatformAdmin)
    .map((user) => user.lastLogin ?? user.createdAt)
    .map((date) => date.getTime());

  if (!timestamps.length) {
    return null;
  }

  return new Date(Math.max(...timestamps));
}

function hasAuthorizedBilling(tenant: RetentionTenant) {
  return tenant.billingSubscriptions.some((subscription) => subscription.status === "authorized");
}

function recipientsForTenant(tenant: RetentionTenant) {
  const activeUsers = tenant.users.filter((user) => user.isActive && !user.isPlatformAdmin && user.email);
  const admins = activeUsers.filter((user) => user.role === "admin");
  const source = admins.length ? admins : activeUsers;
  const seen = new Set<string>();

  return source.reduce<RetentionRecipient[]>((recipients, user) => {
    const emailKey = user.email.toLowerCase();

    if (seen.has(emailKey)) {
      return recipients;
    }

    seen.add(emailKey);
    recipients.push({
      id: user.id,
      email: user.email,
      name: user.name
    });

    return recipients;
  }, []);
}

async function loadRetentionTenants() {
  return prisma.tenant.findMany({
    where: {
      isActive: true,
      users: {
        some: {
          isPlatformAdmin: false
        }
      }
    },
    include: {
      planConfig: {
        select: {
          id: true,
          name: true,
          slug: true,
          tier: true,
          trialDays: true
        }
      },
      users: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          isPlatformAdmin: true,
          lastLogin: true,
          createdAt: true
        }
      },
      billingSubscriptions: {
        select: {
          id: true,
          status: true
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

async function findRetentionActor(): Promise<RetentionActor> {
  const actor = await prisma.user.findFirst({
    where: {
      isPlatformAdmin: true,
      isActive: true
    },
    select: {
      id: true,
      tenantId: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  return actor ?? null;
}

export async function getRetentionPolicy(): Promise<RetentionPolicy> {
  const setting = await prisma.platformSetting.findUnique({
    where: {
      key: RETENTION_POLICY_KEY
    },
    select: {
      value: true
    }
  });

  return normalizeRetentionPolicy(setting?.value);
}

export async function updateRetentionPolicy(input: { enabled: boolean; closureDays: number }) {
  const currentPolicy = await getRetentionPolicy();
  const now = new Date();
  const policy = normalizeRetentionPolicy({
    enabled: input.enabled,
    closureDays: input.closureDays,
    enabledAt: input.enabled ? currentPolicy.enabledAt ?? now.toISOString() : null,
    graceUntil:
      input.enabled
        ? !currentPolicy.enabled
          ? new Date(now.getTime() + 7 * DAY_MS).toISOString()
          : currentPolicy.graceUntil
        : null
  });

  await prisma.platformSetting.upsert({
    where: {
      key: RETENTION_POLICY_KEY
    },
    create: {
      key: RETENTION_POLICY_KEY,
      value: policy
    },
    update: {
      value: policy
    }
  });

  return policy;
}

async function wasWarningAlreadyAttempted(input: {
  tenantId: string;
  userId: string;
  reason: RetentionReason;
  stage: RetentionStage;
}) {
  const count = await prisma.notificationDelivery.count({
    where: {
      tenantId: input.tenantId,
      userId: input.userId,
      channel: NotificationChannel.email,
      subject: subjectFor(input.reason, input.stage)
    }
  });

  return count > 0;
}

async function maybeLogRetentionAudit(input: {
  actor: RetentionActor;
  tenant: RetentionTenant;
  action: string;
  summary: string;
  metadata: Record<string, unknown>;
}) {
  if (!input.actor) {
    return;
  }

  await logAdminAudit({
    actorUserId: input.actor.id,
    actorTenantId: input.actor.tenantId,
    targetTenantId: input.tenant.id,
    action: input.action,
    entityType: "retention",
    entityId: input.tenant.id,
    summary: input.summary,
    metadata: input.metadata
  });
}

async function sendWarnings(input: {
  tenant: RetentionTenant;
  reason: RetentionReason;
  stage: RetentionStage;
  days: number;
  dryRun: boolean;
}) {
  const recipients = recipientsForTenant(input.tenant);
  let planned = 0;
  let sent = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    planned += 1;

    if (input.dryRun) {
      continue;
    }

    const alreadyAttempted = await wasWarningAlreadyAttempted({
      tenantId: input.tenant.id,
      userId: recipient.id,
      reason: input.reason,
      stage: input.stage
    });

    if (alreadyAttempted) {
      skipped += 1;
      continue;
    }

    const delivery = await deliverNotification({
      tenantId: input.tenant.id,
      userId: recipient.id,
      channel: NotificationChannel.email,
      target: recipient.email,
      subject: subjectFor(input.reason, input.stage),
      message: messageFor({
        tenantName: input.tenant.name,
        recipientName: recipient.name,
        reason: input.reason,
        stage: input.stage,
        days: input.days
      })
    });

    if (delivery.status === "sent") {
      sent += 1;
    }
  }

  return { planned, sent, skipped };
}

async function closeTenantForRetention(input: {
  actor: RetentionActor;
  tenant: RetentionTenant;
  reason: RetentionReason;
  days: number;
}) {
  await maybeLogRetentionAudit({
    actor: input.actor,
    tenant: input.tenant,
    action: input.reason === "inactivity" ? "retention.inactivity.closed" : "retention.trial.closed",
    summary:
      input.reason === "inactivity"
        ? `Conta ${input.tenant.name} encerrada automaticamente por inatividade`
        : `Conta ${input.tenant.name} encerrada automaticamente por trial Pro sem pagamento`,
    metadata: {
      reason: input.reason,
      days: input.days,
      policy: "configured"
    }
  });

  await prisma.tenant.update({
    where: {
      id: input.tenant.id
    },
    data: {
      isActive: false,
      expiresAt: new Date()
    }
  });
}

export async function getRetentionStats(now = new Date()): Promise<RetentionStats> {
  const policy = await getRetentionPolicy();
  const closureProtectedByGrace = isClosureProtectedByGrace(now, policy);
  const tenants = await loadRetentionTenants();
  const warningCutoff = subtractDays(now, 30);
  const lastRun = await prisma.adminAuditLog.findFirst({
    where: {
      action: {
        in: ["retention.notice.sent", "retention.inactivity.closed", "retention.trial.closed"]
      }
    },
    select: {
      summary: true,
      createdAt: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  const warningEmailsLast30Days = await prisma.notificationDelivery.count({
    where: {
      channel: NotificationChannel.email,
      subject: {
        startsWith: WARNING_PREFIX
      },
      createdAt: {
        gte: warningCutoff
      }
    }
  });

  const stats: RetentionStats = {
    inactiveAccounts30: 0,
    inactiveAccounts60: 0,
    inactiveAccountsClosure: 0,
    trialNonPayment30: 0,
    trialNonPayment60: 0,
    trialNonPaymentClosure: 0,
    closureDue: 0,
    warningEmailsLast30Days,
    lastRunAt: lastRun?.createdAt.toISOString() ?? null,
    lastRunSummary: lastRun?.summary ?? null,
    protectedDuringGrace: 0,
    policy
  };

  const closureTenantIds = new Set<string>();
  const protectedTenantIds = new Set<string>();

  for (const tenant of tenants) {
    const latestActivity = latestAccountActivity(tenant);

    if (latestActivity) {
      const inactiveDays = daysSince(now, latestActivity);

      if (inactiveDays >= 30) stats.inactiveAccounts30 += 1;
      if (inactiveDays >= 60) stats.inactiveAccounts60 += 1;
      if (policy.enabled && inactiveDays >= policy.closureDays) {
        stats.inactiveAccountsClosure += 1;

        if (closureProtectedByGrace) {
          protectedTenantIds.add(tenant.id);
        } else {
          closureTenantIds.add(tenant.id);
        }
      }
    }

    if (
      tenant.planConfig.tier === "pro" &&
      tenant.planConfig.trialDays > 0 &&
      tenant.trialExpiresAt &&
      tenant.trialExpiresAt < now &&
      !hasAuthorizedBilling(tenant)
    ) {
      const trialExpiredDays = daysSince(now, tenant.trialExpiresAt);

      if (trialExpiredDays >= 30) stats.trialNonPayment30 += 1;
      if (trialExpiredDays >= 60) stats.trialNonPayment60 += 1;
      if (policy.enabled && trialExpiredDays >= policy.closureDays) {
        stats.trialNonPaymentClosure += 1;

        if (closureProtectedByGrace) {
          protectedTenantIds.add(tenant.id);
        } else {
          closureTenantIds.add(tenant.id);
        }
      }
    }
  }

  stats.closureDue = closureTenantIds.size;
  stats.protectedDuringGrace = protectedTenantIds.size;

  return stats;
}

export async function runRetentionLifecycle(options: { dryRun?: boolean } = {}): Promise<RetentionRunResult> {
  const dryRun = options.dryRun ?? false;
  const now = new Date();
  const policy = await getRetentionPolicy();
  const closureProtectedByGrace = isClosureProtectedByGrace(now, policy);
  const actor = dryRun ? null : await findRetentionActor();
  const tenants = await loadRetentionTenants();
  const result: RetentionRunResult = {
    dryRun,
    scannedTenants: tenants.length,
    warningsPlanned: 0,
    warningsSent: 0,
    skippedWarnings: 0,
    inactiveAccountsWarned: 0,
    inactiveAccountsClosed: 0,
    trialAccountsWarned: 0,
    trialAccountsClosed: 0,
    closedTenants: []
  };
  const closedTenantIds = new Set<string>();

  for (const tenant of tenants) {
    if (
      tenant.planConfig.tier === "pro" &&
      tenant.planConfig.trialDays > 0 &&
      tenant.trialExpiresAt &&
      tenant.trialExpiresAt < now &&
      !hasAuthorizedBilling(tenant)
    ) {
      const days = daysSince(now, tenant.trialExpiresAt);
      const stage = resolveStage(days, policy);

      if (stage) {
        const effectiveStage = stage === 3 && closureProtectedByGrace ? 2 : stage;
        const warning = await sendWarnings({
          tenant,
          reason: "trial_nonpayment",
          stage: effectiveStage,
          days,
          dryRun
        });

        result.warningsPlanned += warning.planned;
        result.warningsSent += warning.sent;
        result.skippedWarnings += warning.skipped;
        result.trialAccountsWarned += 1;

        if (!dryRun && warning.sent > 0) {
          await maybeLogRetentionAudit({
            actor,
            tenant,
            action: "retention.notice.sent",
            summary: `Aviso ${effectiveStage}/3 enviado para trial Pro sem pagamento em ${tenant.name}`,
            metadata: {
              reason: "trial_nonpayment",
              stage: effectiveStage,
              days,
              planned: warning.planned,
              sent: warning.sent,
              skipped: warning.skipped
            }
          });
        }

        if (stage === 3 && !closureProtectedByGrace) {
          if (!dryRun) {
            await closeTenantForRetention({
              actor,
              tenant,
              reason: "trial_nonpayment",
              days
            });
          }

          result.trialAccountsClosed += 1;
          result.closedTenants.push({ id: tenant.id, name: tenant.name, reason: "trial_nonpayment" });
          closedTenantIds.add(tenant.id);
        }
      }
    }
  }

  for (const tenant of tenants) {
    if (closedTenantIds.has(tenant.id)) {
      continue;
    }

    const latestActivity = latestAccountActivity(tenant);

    if (!latestActivity) {
      continue;
    }

    const days = daysSince(now, latestActivity);
    const stage = resolveStage(days, policy);

    if (!stage) {
      continue;
    }

    const effectiveStage = stage === 3 && closureProtectedByGrace ? 2 : stage;
    const warning = await sendWarnings({
      tenant,
      reason: "inactivity",
      stage: effectiveStage,
      days,
      dryRun
    });

    result.warningsPlanned += warning.planned;
    result.warningsSent += warning.sent;
    result.skippedWarnings += warning.skipped;
    result.inactiveAccountsWarned += 1;

    if (!dryRun && warning.sent > 0) {
      await maybeLogRetentionAudit({
        actor,
        tenant,
        action: "retention.notice.sent",
        summary: `Aviso ${effectiveStage}/3 enviado por inatividade em ${tenant.name}`,
        metadata: {
          reason: "inactivity",
          stage: effectiveStage,
          days,
          planned: warning.planned,
          sent: warning.sent,
          skipped: warning.skipped
        }
      });
    }

    if (stage === 3 && !closureProtectedByGrace) {
      if (!dryRun) {
        await closeTenantForRetention({
          actor,
          tenant,
          reason: "inactivity",
          days
        });
      }

      result.inactiveAccountsClosed += 1;
      result.closedTenants.push({ id: tenant.id, name: tenant.name, reason: "inactivity" });
    }
  }

  return result;
}
