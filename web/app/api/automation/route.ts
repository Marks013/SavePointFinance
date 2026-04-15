import { NextResponse } from "next/server";

import { runRecurringAutomation } from "@/lib/automation/subscriptions";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateFinanceReports } from "@/lib/cache/finance-read-models";
import {
  getCurrentPayableStatementMonth,
  getStatementPaymentDate,
  getCardStatementSnapshot
} from "@/lib/cards/statement";
import { getEmailChannelHealth, getWhatsAppChannelHealth } from "@/lib/notifications/channel-health";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser({ feature: "automation" });
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const reminderWindow = new Date();
    reminderWindow.setDate(reminderWindow.getDate() + 7);
    reminderWindow.setHours(23, 59, 59, 999);
    const emailHealth = getEmailChannelHealth();
    const whatsappHealth = getWhatsAppChannelHealth();

    const [dueSubscriptions, upcomingGoals, upcomingSubscriptions, cards] = await Promise.all([
      prisma.subscription.count({
        where: {
          tenantId: user.tenantId,
          isActive: true,
          nextBillingDate: {
            lte: now
          }
        }
      }),
      prisma.goal.count({
        where: {
          tenantId: user.tenantId,
          isCompleted: false,
          deadline: {
            gte: now,
            lte: reminderWindow
          }
        }
      }),
      prisma.subscription.findMany({
        where: {
          tenantId: user.tenantId,
          isActive: true,
          nextBillingDate: {
            gte: today,
            lte: reminderWindow
          }
        },
        orderBy: {
          nextBillingDate: "asc"
        },
        take: 4
      }),
      prisma.card.findMany({
        where: {
          tenantId: user.tenantId,
          isActive: true
        },
        orderBy: {
          name: "asc"
        }
      })
    ]);

    const upcomingCardStatements = [];

    for (const card of cards) {
      const statementMonth = getCurrentPayableStatementMonth(card, now);
      const dueDate = getStatementPaymentDate(statementMonth, card.dueDay, card.closeDay, card.statementMonthAnchor);

      if (dueDate < today || dueDate > reminderWindow) {
        continue;
      }

      const payment = await prisma.statementPayment.findUnique({
        where: {
          tenantId_cardId_month: {
            tenantId: user.tenantId,
            cardId: card.id,
            month: statementMonth
          }
        },
        select: {
          id: true
        }
      });

      if (payment) {
        continue;
      }

      const statement = await getCardStatementSnapshot({
        tenantId: user.tenantId,
        card,
        month: statementMonth,
        client: prisma
      });

      if (statement.totalAmount <= 0) {
        continue;
      }

      upcomingCardStatements.push({
        type: "card_statement" as const,
        label: card.name,
        date: dueDate.toISOString(),
        amount: statement.totalAmount
      });
    }

    const warningPreview = [
      ...upcomingSubscriptions.map((subscription) => ({
        type: "subscription" as const,
        label: subscription.name,
        date: subscription.nextBillingDate.toISOString(),
        amount: Number(subscription.amount)
      })),
      ...upcomingCardStatements,
      ...(
        await prisma.goal.findMany({
          where: {
            tenantId: user.tenantId,
            isCompleted: false,
            deadline: {
              gte: today,
              lte: reminderWindow
            }
          },
          orderBy: {
            deadline: "asc"
          },
          take: 4
        })
      ).map((goal) => ({
        type: "goal_deadline" as const,
        label: goal.name,
        date: goal.deadline!.toISOString(),
        amount: Number(goal.targetAmount) - Number(goal.currentAmount)
      }))
    ]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 6);

    return NextResponse.json({
      dueSubscriptions,
      upcomingGoals,
      upcomingCardStatements: upcomingCardStatements.length,
      warningPreview,
      delivery: {
        email: emailHealth,
        whatsapp: whatsappHealth
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "automation" });
    return NextResponse.json({ message: "Failed to load automation summary" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser({ feature: "automation" });
    const result = await runRecurringAutomation(user.tenantId, user.id);
    revalidateFinanceReports(user.tenantId);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "automation" });
    return NextResponse.json({ message: "Failed to run automation" }, { status: 400 });
  }
}
