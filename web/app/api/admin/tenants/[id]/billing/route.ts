import { NextResponse } from "next/server";
import { z } from "zod";

import { logAdminAudit } from "@/lib/admin/audit";
import { requireAdminUser } from "@/lib/auth/admin";
import { processQueuedMercadoPagoWebhookEvents } from "@/lib/billing/async-processor";
import {
  syncMercadoPagoPaymentById,
  syncMercadoPagoSubscriptionById,
  toBillingRouteStatus
} from "@/lib/billing/service";
import { syncDueSubscriptionTransactions } from "@/lib/automation/subscriptions";
import { revalidateFinanceReports } from "@/lib/cache/finance-read-models";
import { buildTitheIncomeTransactionWhere, syncTitheForMonthKeys } from "@/lib/finance/tithe";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{ id: string }>;
};

const billingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("sync_subscription")
  }),
  z.object({
    action: z.literal("process_queue")
  }),
  z.object({
    action: z.literal("recalculate_tithe_month"),
    monthKey: z.string().regex(/^\d{4}-\d{2}$/, "Informe a competência no formato YYYY-MM")
  }),
  z.object({
    action: z.literal("sync_due_subscriptions")
  }),
  z.object({
    action: z.literal("reconcile_due_installments")
  })
]);

function ensureAdminCanManageTenant(admin: Awaited<ReturnType<typeof requireAdminUser>>, tenantId: string) {
  if (!admin.isPlatformAdmin && admin.tenantId !== tenantId) {
    throw new Error("Forbidden");
  }
}

function ensurePlatformAdmin(admin: Awaited<ReturnType<typeof requireAdminUser>>) {
  if (!admin.isPlatformAdmin) {
    throw new Error("Forbidden");
  }
}

function getBillingMode(metadata: unknown) {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const mode = (metadata as Record<string, unknown>).billingMode;
    return typeof mode === "string" ? mode : "monthly_recurring";
  }

  return "monthly_recurring";
}

async function getTenantRepairUser(tenantId: string) {
  const activeUser = await prisma.user.findFirst({
    where: {
      tenantId,
      isActive: true
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true
    }
  });

  if (activeUser) {
    return activeUser;
  }

  return prisma.user.findFirst({
    where: {
      tenantId
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      email: true
    }
  });
}

export async function GET(_request: Request, context: Params) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    ensureAdminCanManageTenant(admin, id);

    const tenant = await prisma.tenant.findUnique({
      where: {
        id
      },
      select: {
        id: true,
        name: true,
        slug: true,
        planId: true,
        expiresAt: true,
        trialExpiresAt: true,
        billingSubscriptions: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1,
          select: {
            id: true,
            status: true,
            reason: true,
            externalReference: true,
            mercadoPagoPreapprovalId: true,
            payerEmail: true,
            amount: true,
            currencyId: true,
            frequency: true,
            frequencyType: true,
            nextBillingAt: true,
            cancelRequestedAt: true,
            canceledAt: true,
            lastSyncedAt: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
            payments: {
              orderBy: {
                createdAt: "desc"
              },
              take: 5,
              select: {
                id: true,
                providerPaymentId: true,
                status: true,
                amount: true,
                approvedAt: true,
                refundedAt: true,
                refundStatus: true,
                createdAt: true
              }
            }
          }
        }
      }
    });

    if (!tenant) {
      return NextResponse.json({ message: "Conta não encontrada" }, { status: 404 });
    }

    const currentSubscription = tenant.billingSubscriptions[0] ?? null;
    const webhookResourceIds = currentSubscription
      ? [
          currentSubscription.mercadoPagoPreapprovalId,
          ...currentSubscription.payments.map((payment) => payment.providerPaymentId)
        ].filter((value): value is string => Boolean(value))
      : [];
    const webhookEvents = webhookResourceIds.length
      ? await prisma.billingWebhookEvent.findMany({
          where: {
            resourceId: {
              in: webhookResourceIds
            }
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 20,
          select: {
            id: true,
            topic: true,
            status: true,
            error: true,
            attempts: true,
            nextAttemptAt: true,
            processedAt: true,
            createdAt: true
          }
        })
      : [];

    return NextResponse.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        planId: tenant.planId,
        expiresAt: tenant.expiresAt?.toISOString() ?? null,
        trialExpiresAt: tenant.trialExpiresAt?.toISOString() ?? null
      },
      subscription: currentSubscription
        ? {
            ...currentSubscription,
            amount: Number(currentSubscription.amount),
            billingMode: getBillingMode(currentSubscription.metadata),
            metadata: currentSubscription.metadata,
            nextBillingAt: currentSubscription.nextBillingAt?.toISOString() ?? null,
            cancelRequestedAt: currentSubscription.cancelRequestedAt?.toISOString() ?? null,
            canceledAt: currentSubscription.canceledAt?.toISOString() ?? null,
            lastSyncedAt: currentSubscription.lastSyncedAt?.toISOString() ?? null,
            createdAt: currentSubscription.createdAt.toISOString(),
            updatedAt: currentSubscription.updatedAt.toISOString(),
            payments: currentSubscription.payments.map((payment) => ({
              ...payment,
              amount: Number(payment.amount),
              approvedAt: payment.approvedAt?.toISOString() ?? null,
              refundedAt: payment.refundedAt?.toISOString() ?? null,
              createdAt: payment.createdAt.toISOString()
            }))
          }
        : null,
      webhookEvents: webhookEvents.map((event) => ({
        ...event,
        nextAttemptAt: event.nextAttemptAt?.toISOString() ?? null,
        processedAt: event.processedAt?.toISOString() ?? null,
        createdAt: event.createdAt.toISOString()
      }))
    });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json({ message: "Failed to load tenant billing" }, { status: 500 });
  }
}

export async function POST(request: Request, context: Params) {
  try {
    const admin = await requireAdminUser();
    const { id } = await context.params;
    ensureAdminCanManageTenant(admin, id);

    const body = billingActionSchema.parse(await request.json());

    if (body.action === "recalculate_tithe_month") {
      ensurePlatformAdmin(admin);
      const tenantUser = await getTenantRepairUser(id);

      if (!tenantUser) {
        return NextResponse.json(
          { message: "A conta não possui um usuário ativo para executar o recálculo do dízimo" },
          { status: 404 }
        );
      }

      const incomeTransactions = await prisma.transaction.findMany({
        where: {
          ...buildTitheIncomeTransactionWhere(id, body.monthKey)
        },
        select: {
          id: true,
          amount: true,
          titheAmount: true,
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });
      const eligibleIncomeTransactions = incomeTransactions.filter((transaction) => Number(transaction.titheAmount ?? 0) > 0);
      const usersWithIncome = Array.from(
        new Set(
          incomeTransactions.map((transaction) => transaction.user?.name || transaction.user?.email || "usuário sem vínculo").filter(Boolean)
        )
      );
      const usersWithEligibleTithe = Array.from(
        new Set(
          eligibleIncomeTransactions
            .map((transaction) => transaction.user?.name || transaction.user?.email || "usuário sem vínculo")
            .filter(Boolean)
        )
      );

      await syncTitheForMonthKeys({
        tenantId: id,
        userId: tenantUser.id,
        monthKeys: [body.monthKey]
      });
      revalidateFinanceReports(id);

      const autoTitheTransaction = await prisma.transaction.findFirst({
        where: {
          tenantId: id,
          type: "expense",
          notes: `[AUTO_TITHE:${body.monthKey}]`
        },
        select: {
          id: true,
          amount: true
        }
      });

      await logAdminAudit({
        actorUserId: admin.id,
        actorTenantId: admin.tenantId,
        targetTenantId: id,
        action: "finance.tithe.recalculated",
        entityType: "transaction",
        entityId: autoTitheTransaction?.id ?? null,
        summary: `Recálculo administrativo do dízimo consolidado em ${body.monthKey} para a conta ${id}`,
        metadata: {
          monthKey: body.monthKey,
          autoTitheTransactionId: autoTitheTransaction?.id ?? null,
          autoTitheAmount: autoTitheTransaction ? Number(autoTitheTransaction.amount) : 0,
          incomeCount: incomeTransactions.length,
          eligibleIncomeCount: eligibleIncomeTransactions.length,
          usersWithIncome,
          usersWithEligibleTithe,
          executedWithUserEmail: tenantUser.email
        }
      });

      const userSample = usersWithIncome.slice(0, 4).join(", ");
      const remainingUsers = Math.max(usersWithIncome.length - 4, 0);
      const userSummary = userSample ? `${userSample}${remainingUsers > 0 ? ` e mais ${remainingUsers}` : ""}` : "nenhum usuário";

      return NextResponse.json({
        success: true,
        message: autoTitheTransaction
          ? `Dízimo de ${body.monthKey} recalculado com sucesso a partir de ${eligibleIncomeTransactions.length} receita(s) marcada(s). Usuários identificados: ${userSummary}`
          : incomeTransactions.length > 0
            ? `Encontramos ${incomeTransactions.length} receita(s) em ${body.monthKey}, mas nenhuma estava marcada para dízimo. Usuários identificados: ${userSummary}. O lançamento automático antigo foi removido.`
            : `Não havia receita em ${body.monthKey}; o lançamento automático foi removido`
      });
    }

    if (body.action === "sync_due_subscriptions") {
      ensurePlatformAdmin(admin);
      const tenantUser = await getTenantRepairUser(id);

      if (!tenantUser) {
        return NextResponse.json(
          { message: "A conta não possui um usuário ativo para sincronizar as recorrências" },
          { status: 404 }
        );
      }

      const result = await syncDueSubscriptionTransactions({
        tenantId: id,
        userId: tenantUser.id
      });
      revalidateFinanceReports(id);

      await logAdminAudit({
        actorUserId: admin.id,
        actorTenantId: admin.tenantId,
        targetTenantId: id,
        action: "finance.subscriptions.synced",
        entityType: "subscription",
        summary: `Sincronização administrativa das recorrências executada para a conta ${id}`,
        metadata: {
          processed: result.length,
          duplicated: result.filter((item) => item.duplicated).length,
          created: result.filter((item) => !item.duplicated).length,
          executedWithUserEmail: tenantUser.email
        }
      });

      return NextResponse.json({
        success: true,
        message:
          result.length > 0
            ? `${result.length} recorrência(s) sincronizada(s) com sucesso`
            : "Nenhuma recorrência vencida precisava de sincronização"
      });
    }

    if (body.action === "reconcile_due_installments") {
      ensurePlatformAdmin(admin);
      const settledAt = new Date();
      const result = await prisma.transaction.updateMany({
        where: {
          tenantId: id,
          installmentsTotal: {
            gt: 1
          },
          date: {
            lte: settledAt
          },
          settledAt: null
        },
        data: {
          settledAt
        }
      });
      revalidateFinanceReports(id);

      await logAdminAudit({
        actorUserId: admin.id,
        actorTenantId: admin.tenantId,
        targetTenantId: id,
        action: "finance.installments.reconciled",
        entityType: "transaction",
        summary: `Conciliação administrativa de parcelas vencidas executada para a conta ${id}`,
        metadata: {
          reconciled: result.count
        }
      });

      return NextResponse.json({
        success: true,
        message:
          result.count > 0
            ? `${result.count} parcela(s) vencida(s) foram conciliadas`
            : "Nenhuma parcela vencida precisava de conciliação"
      });
    }

    const latestSubscription = await prisma.billingSubscription.findFirst({
      where: {
        tenantId: id
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        mercadoPagoPreapprovalId: true,
        payments: {
          orderBy: {
            createdAt: "desc"
          },
          take: 5,
          select: {
            providerPaymentId: true
          }
        }
      }
    });

    if (body.action === "sync_subscription") {
      if (!latestSubscription) {
        return NextResponse.json({ message: "Não existe billing do Mercado Pago vinculado a esta conta" }, { status: 404 });
      }

      const latestPaymentId = latestSubscription.payments[0]?.providerPaymentId ?? null;
      const synced = latestSubscription.mercadoPagoPreapprovalId
        ? await syncMercadoPagoSubscriptionById(latestSubscription.mercadoPagoPreapprovalId)
        : latestPaymentId
          ? await syncMercadoPagoPaymentById(latestPaymentId)
          : null;

      if (!synced) {
        return NextResponse.json({ message: "Billing local não encontrado para sincronização" }, { status: 404 });
      }

      await logAdminAudit({
        actorUserId: admin.id,
        actorTenantId: admin.tenantId,
        targetTenantId: id,
        action: "billing.subscription.synced",
        entityType: "billing",
        entityId: latestSubscription.id,
        summary: `Sincronização manual da assinatura executada para a conta ${id}`,
        metadata: {
          mercadoPagoPreapprovalId:
            "mercadoPagoPreapprovalId" in synced ? synced.mercadoPagoPreapprovalId : latestSubscription.mercadoPagoPreapprovalId,
          latestPaymentId,
          status: "status" in synced ? synced.status : undefined
        }
      });

      return NextResponse.json({
        success: true,
        message: "Assinatura sincronizada com sucesso"
      });
    }

    if (!latestSubscription) {
      return NextResponse.json({ message: "Não existe billing do Mercado Pago vinculado a esta conta" }, { status: 404 });
    }

    const resourceIds = [
      latestSubscription.mercadoPagoPreapprovalId,
      ...latestSubscription.payments.map((payment) => payment.providerPaymentId)
    ].filter((value): value is string => Boolean(value));

    if (!resourceIds.length) {
      return NextResponse.json({ message: "Não há recurso do Mercado Pago para reprocessar nesta conta" }, { status: 404 });
    }

    const queuedEvents = await prisma.billingWebhookEvent.findMany({
      where: {
        resourceId: {
          in: resourceIds
        },
        status: {
          in: ["pending", "processing", "failed"]
        }
      },
      select: {
        id: true
      }
    });

    const result = await processQueuedMercadoPagoWebhookEvents({
      eventIds: queuedEvents.map((event) => event.id)
    });

    await logAdminAudit({
      actorUserId: admin.id,
      actorTenantId: admin.tenantId,
      targetTenantId: id,
      action: "billing.queue.reprocessed",
      entityType: "billing",
      entityId: latestSubscription.id,
      summary: `Fila de billing reprocessada manualmente para a conta ${id}`,
      metadata: {
        processed: result.processed,
        failed: result.failed,
        ignored: result.ignored,
        skipped: result.skipped
      }
    });

    return NextResponse.json({
      success: true,
      message: "Fila de billing processada manualmente",
      result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: error.issues[0]?.message ?? "Ação inválida" }, { status: 400 });
    }

    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Forbidden")) {
      return NextResponse.json({ message: error.message }, { status: error.message === "Forbidden" ? 403 : 401 });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to execute tenant billing action" },
      { status: toBillingRouteStatus(error) }
    );
  }
}
