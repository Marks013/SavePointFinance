import { NotificationChannel, PaymentMethod, TransactionSource, TransactionType } from "@prisma/client";

import { deliverNotification } from "@/lib/notifications/delivery";
import {
  getCardExpenseDueDate,
  getCardStatementSnapshot,
  getCurrentStatementMonth,
  getStatementPaymentDate
} from "@/lib/cards/statement";
import { getFinanceReport } from "@/lib/finance/reports";
import { ensureTitheCategory, getMonthKey, syncMonthlyTitheTransaction } from "@/lib/finance/tithe";
import { prisma } from "@/lib/prisma/client";
import { addMonthsClamped, formatCurrency } from "@/lib/utils";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

async function alreadyDeliveredSince({
  tenantId,
  userId,
  channel,
  subject,
  since
}: {
  tenantId: string;
  userId: string;
  channel: NotificationChannel;
  subject: string;
  since: Date;
}) {
  const existing = await prisma.notificationDelivery.findFirst({
    where: {
      tenantId,
      userId,
      channel,
      subject,
      createdAt: {
        gte: since
      }
    },
    select: {
      id: true
    }
  });

  return Boolean(existing);
}

async function sendUserNotifications({
  tenantId,
  userId,
  goalId,
  email,
  whatsappNumber,
  sendEmail,
  sendWhatsApp,
  subject,
  message,
  dedupeSince
}: {
  tenantId: string;
  userId: string;
  goalId?: string | null;
  email?: string | null;
  whatsappNumber?: string | null;
  sendEmail: boolean;
  sendWhatsApp: boolean;
  subject: string;
  message: string;
  dedupeSince: Date;
}) {
  const deliveries: Array<{ id: string; channel: string; status: string; target: string }> = [];

  if (sendEmail && email) {
    const skip = await alreadyDeliveredSince({
      tenantId,
      userId,
      channel: NotificationChannel.email,
      subject,
      since: dedupeSince
    });

    if (!skip) {
      const delivery = await deliverNotification({
        tenantId,
        userId,
        goalId: goalId ?? null,
        channel: NotificationChannel.email,
        target: email,
        subject,
        message
      });

      deliveries.push({
        id: delivery.id,
        channel: delivery.channel,
        status: delivery.status,
        target: delivery.target
      });
    }
  }

  if (sendWhatsApp && whatsappNumber) {
    const skip = await alreadyDeliveredSince({
      tenantId,
      userId,
      channel: NotificationChannel.whatsapp,
      subject,
      since: dedupeSince
    });

    if (!skip) {
      const delivery = await deliverNotification({
        tenantId,
        userId,
        goalId: goalId ?? null,
        channel: NotificationChannel.whatsapp,
        target: whatsappNumber,
        subject,
        message
      });

      deliveries.push({
        id: delivery.id,
        channel: delivery.channel,
        status: delivery.status,
        target: delivery.target
      });
    }
  }

  return deliveries;
}

export async function generateSubscriptionTransaction(subscriptionId: string, tenantId: string, userId: string) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      id: subscriptionId,
      tenantId
    },
    include: {
      card: {
        select: {
          id: true,
          closeDay: true,
          dueDay: true
        }
      }
    }
  });

  if (!subscription) {
    throw new Error("Subscription not found");
  }

  const existing = await prisma.transaction.findFirst({
    where: {
      tenantId,
      subscriptionId: subscription.id,
      date: subscription.card
        ? getCardExpenseDueDate(subscription.card, subscription.nextBillingDate)
        : subscription.nextBillingDate
    },
    select: {
      id: true
    }
  });

  if (existing) {
    return {
      transactionId: existing.id,
      duplicated: true,
      nextBillingDate: subscription.nextBillingDate.toISOString()
    };
  }

  const transaction = await prisma.transaction.create({
    data: {
      tenantId,
      userId: subscription.userId ?? userId,
      subscriptionId: subscription.id,
      date: subscription.card
        ? getCardExpenseDueDate(subscription.card, subscription.nextBillingDate)
        : subscription.nextBillingDate,
      amount: subscription.amount,
      description: `Assinatura: ${subscription.name}`,
      type: subscription.type === "income" ? TransactionType.income : TransactionType.expense,
      paymentMethod: subscription.cardId ? PaymentMethod.credit_card : PaymentMethod.money,
      categoryId: subscription.categoryId,
      accountId: subscription.accountId,
      cardId: subscription.cardId,
      source: TransactionSource.manual,
      notes: "Gerado automaticamente via assinaturas",
      titheAmount:
        subscription.type === "income" && subscription.autoTithe
          ? Number(subscription.amount) * 0.1
          : null,
      titheCategoryId:
        subscription.type === "income" && subscription.autoTithe ? await ensureTitheCategory(tenantId) : null
    }
  });

  const updated = await prisma.subscription.update({
    where: {
      id: subscription.id,
      tenantId
    },
    data: {
      nextBillingDate: addMonthsClamped(subscription.nextBillingDate, 1)
    }
  });

  if (subscription.type === "income" && subscription.autoTithe) {
    await syncMonthlyTitheTransaction({
      tenantId,
      userId: subscription.userId ?? userId,
      monthKey: getMonthKey(subscription.nextBillingDate)
    });
  }

  return {
    transactionId: transaction.id,
    duplicated: false,
    nextBillingDate: updated.nextBillingDate.toISOString()
  };
}

export async function runRecurringAutomation(tenantId: string, userId: string) {
  const now = new Date();
  const tenantUser = await prisma.user.findFirst({
    where: {
      id: userId,
      tenantId,
      isActive: true
    },
    include: {
      preferences: true
    }
  });

  if (!tenantUser) {
    throw new Error("User not found");
  }

  const dueSubscriptions = await prisma.subscription.findMany({
    where: {
      tenantId,
      isActive: true,
      nextBillingDate: {
        lte: now
      }
    },
    orderBy: {
      nextBillingDate: "asc"
    }
  });

  const results = [];

  for (const subscription of dueSubscriptions) {
    let safety = 0;

    while (safety < 24) {
      const freshSubscription = await prisma.subscription.findFirst({
        where: {
          id: subscription.id,
          tenantId,
          isActive: true
        }
      });

      if (!freshSubscription || freshSubscription.nextBillingDate > now) {
        break;
      }

      const result = await generateSubscriptionTransaction(subscription.id, tenantId, userId);
      results.push({
        id: subscription.id,
        name: subscription.name,
        ...result
      });

      if (result.duplicated) {
        const advancedDate = addMonthsClamped(freshSubscription.nextBillingDate, 1);

        await prisma.subscription.update({
          where: {
            id: freshSubscription.id,
            tenantId
          },
          data: {
            nextBillingDate: advancedDate
          }
        });
      }

      safety += 1;
    }
  }

  const reminderWindow = new Date();
  reminderWindow.setDate(reminderWindow.getDate() + 7);

  const dueGoals = await prisma.goal.findMany({
    where: {
      tenantId,
      isCompleted: false,
      OR: [
        {
          deadline: {
            lte: reminderWindow,
            gte: now
          }
        },
        {
          targetAmount: {
            gt: 0
          }
        }
      ]
    },
    orderBy: {
      deadline: "asc"
    }
  });

  const reminders = [];
  const notificationDeliveries = [];

  for (const goal of dueGoals) {
    const progress = Number(goal.targetAmount) > 0 ? Number(goal.currentAmount) / Number(goal.targetAmount) : 0;
    const milestoneReached =
      (goal.milestone25 === "enabled" && progress >= 0.25) ||
      (goal.milestone50 === "enabled" && progress >= 0.5) ||
      (goal.milestone75 === "enabled" && progress >= 0.75);
    const deadlineSoon = Boolean(goal.deadline && goal.deadline <= reminderWindow && goal.deadline >= now);

    if (!milestoneReached && !deadlineSoon) {
      continue;
    }

    if (goal.lastNotifiedAt) {
      const hoursSinceLastNotification = (now.getTime() - goal.lastNotifiedAt.getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastNotification < 24) {
        continue;
      }
    }

    const reason = deadlineSoon ? "deadline" : "milestone";
    const subject = deadlineSoon ? `Meta proxima do vencimento: ${goal.name}` : `Meta avancou: ${goal.name}`;
    const message = deadlineSoon
      ? `A meta ${goal.name} vence em breve. Progresso atual: ${Math.round(progress * 100)}%.`
      : `A meta ${goal.name} atingiu um novo marco. Progresso atual: ${Math.round(progress * 100)}%.`;

    await prisma.goal.update({
      where: {
        id: goal.id,
        tenantId
      },
      data: {
        lastNotifiedAt: new Date()
      }
    });

    reminders.push({
      id: goal.id,
      name: goal.name,
      progress,
      deadline: goal.deadline?.toISOString() ?? null,
      reason
    });

    notificationDeliveries.push(
      ...(await sendUserNotifications({
        tenantId,
        userId: tenantUser.id,
        goalId: goal.id,
        email: tenantUser.email,
        whatsappNumber: tenantUser.whatsappNumber,
        sendEmail: Boolean(tenantUser.preferences?.emailNotifications),
        sendWhatsApp: Boolean(tenantUser.preferences?.dueReminders),
        subject,
        message,
        dedupeSince: startOfDay(now)
      }))
    );
  }

  const reminderWindowSubscriptions = await prisma.subscription.findMany({
    where: {
      tenantId,
      isActive: true,
      nextBillingDate: {
        gt: now,
        lte: reminderWindow
      }
    },
    orderBy: {
      nextBillingDate: "asc"
    }
  });

  for (const subscription of reminderWindowSubscriptions) {
    const subject = `Assinatura próxima: ${subscription.name}`;
    const message =
      `${subscription.type === "income" ? "Receita" : "Despesa"} recorrente prevista para ` +
      `${subscription.nextBillingDate.toLocaleDateString("pt-BR")}: ${formatCurrency(Number(subscription.amount))}.`;

    notificationDeliveries.push(
      ...(await sendUserNotifications({
        tenantId,
        userId: tenantUser.id,
        email: tenantUser.email,
        whatsappNumber: tenantUser.whatsappNumber,
        sendEmail: Boolean(tenantUser.preferences?.emailNotifications && tenantUser.preferences?.dueReminders),
        sendWhatsApp: Boolean(tenantUser.preferences?.dueReminders),
        subject,
        message,
        dedupeSince: startOfDay(now)
      }))
    );
  }

  const cards = await prisma.card.findMany({
    where: {
      tenantId,
      isActive: true
    },
    orderBy: {
      name: "asc"
    }
  });

  for (const card of cards) {
    const statementMonth = getCurrentStatementMonth(card.closeDay, now);
    const dueDate = getStatementPaymentDate(statementMonth, card.dueDay);

    if (dueDate <= now || dueDate > reminderWindow) {
      continue;
    }

    const payment = await prisma.statementPayment.findUnique({
      where: {
        tenantId_cardId_month: {
          tenantId,
          cardId: card.id,
          month: statementMonth
        }
      },
      select: { id: true }
    });

    if (payment) {
      continue;
    }

    const statement = await getCardStatementSnapshot({
      tenantId,
      card,
      month: statementMonth,
      client: prisma
    });
    const statementAmount = statement.totalAmount;

    if (statementAmount <= 0) {
      continue;
    }

    const subject = `Fatura próxima do vencimento: ${card.name}`;
    const message =
      `A fatura do cartão ${card.name} vence em ${dueDate.toLocaleDateString("pt-BR")} ` +
      `no valor atual de ${formatCurrency(statementAmount)}.`;

    notificationDeliveries.push(
      ...(await sendUserNotifications({
        tenantId,
        userId: tenantUser.id,
        email: tenantUser.email,
        whatsappNumber: tenantUser.whatsappNumber,
        sendEmail: Boolean(tenantUser.preferences?.emailNotifications && tenantUser.preferences?.dueReminders),
        sendWhatsApp: Boolean(tenantUser.preferences?.dueReminders),
        subject,
        message,
        dedupeSince: startOfDay(now)
      }))
    );

    const limitAmount = Number(card.limitAmount);
    const utilization = limitAmount > 0 ? statementAmount / limitAmount : 0;

    if (limitAmount > 0 && statementAmount >= limitAmount) {
      const subject = `Limite excedido: ${card.name}`;
      const message =
        `O cartão ${card.name} alcançou ${formatCurrency(statementAmount)} em fatura aberta, ` +
        `acima do limite de ${formatCurrency(limitAmount)}.`;

      notificationDeliveries.push(
        ...(await sendUserNotifications({
          tenantId,
          userId: tenantUser.id,
          email: tenantUser.email,
          whatsappNumber: tenantUser.whatsappNumber,
          sendEmail: Boolean(tenantUser.preferences?.emailNotifications && tenantUser.preferences?.budgetAlerts),
          sendWhatsApp: Boolean(tenantUser.preferences?.budgetAlerts),
          subject,
          message,
          dedupeSince: startOfDay(now)
        }))
      );
    } else if (limitAmount > 0 && utilization >= 0.8) {
      const subject = `Uso alto do limite: ${card.name}`;
      const message =
        `O cartão ${card.name} está usando ${Math.round(utilization * 100)}% do limite. ` +
        `Fatura atual: ${formatCurrency(statementAmount)} de ${formatCurrency(limitAmount)}.`;

      notificationDeliveries.push(
        ...(await sendUserNotifications({
          tenantId,
          userId: tenantUser.id,
          email: tenantUser.email,
          whatsappNumber: tenantUser.whatsappNumber,
          sendEmail: Boolean(tenantUser.preferences?.emailNotifications && tenantUser.preferences?.budgetAlerts),
          sendWhatsApp: Boolean(tenantUser.preferences?.budgetAlerts),
          subject,
          message,
          dedupeSince: startOfDay(now)
        }))
      );
    }
  }

  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const previousMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthStart = startOfMonth(previousMonthDate);
  const previousMonthEnd = endOfMonth(previousMonthDate);

  const [budgetCategories, currentMonthExpenses, previousMonthExpenses] = await Promise.all([
    prisma.category.findMany({
      where: {
        tenantId,
        type: "expense",
        monthlyLimit: {
          not: null
        }
      },
      select: {
        id: true,
        name: true,
        monthlyLimit: true
      }
    }),
    prisma.transaction.findMany({
      where: {
        tenantId,
        type: "expense",
        date: {
          gte: currentMonthStart,
          lte: currentMonthEnd
        }
      },
      select: {
        categoryId: true,
        amount: true
      }
    }),
    prisma.transaction.findMany({
      where: {
        tenantId,
        type: "expense",
        date: {
          gte: previousMonthStart,
          lte: previousMonthEnd
        }
      },
      select: {
        categoryId: true,
        amount: true
      }
    })
  ]);

  const totalsCurrent = new Map<string, number>();
  const totalsPrevious = new Map<string, number>();

  for (const item of currentMonthExpenses) {
    if (!item.categoryId) continue;
    totalsCurrent.set(item.categoryId, (totalsCurrent.get(item.categoryId) ?? 0) + Number(item.amount));
  }

  for (const item of previousMonthExpenses) {
    if (!item.categoryId) continue;
    totalsPrevious.set(item.categoryId, (totalsPrevious.get(item.categoryId) ?? 0) + Number(item.amount));
  }

  const budgetAlerts = [];

  for (const category of budgetCategories) {
    const currentTotal = totalsCurrent.get(category.id) ?? 0;
    const previousTotal = totalsPrevious.get(category.id) ?? 0;
    const limitAmount = Number(category.monthlyLimit ?? 0);

    if (limitAmount > 0 && currentTotal >= limitAmount) {
      const subject = `Orçamento excedido: ${category.name}`;
      const message =
        `A categoria ${category.name} atingiu ${formatCurrency(currentTotal)} no mês, ` +
        `acima do limite de ${formatCurrency(limitAmount)}.`;

      notificationDeliveries.push(
        ...(await sendUserNotifications({
          tenantId,
          userId: tenantUser.id,
          email: tenantUser.email,
          whatsappNumber: tenantUser.whatsappNumber,
          sendEmail: Boolean(tenantUser.preferences?.emailNotifications && tenantUser.preferences?.budgetAlerts),
          sendWhatsApp: Boolean(tenantUser.preferences?.budgetAlerts),
          subject,
          message,
          dedupeSince: startOfDay(now)
        }))
      );

      budgetAlerts.push({ category: category.name, reason: "limit" });
    }

    if (previousTotal > 0 && currentTotal >= previousTotal * 1.5 && currentTotal - previousTotal >= 100) {
      const subject = `Aumento forte em categoria: ${category.name}`;
      const message =
        `Os gastos em ${category.name} subiram para ${formatCurrency(currentTotal)} no mês. ` +
        `No mês anterior foram ${formatCurrency(previousTotal)}.`;

      notificationDeliveries.push(
        ...(await sendUserNotifications({
          tenantId,
          userId: tenantUser.id,
          email: tenantUser.email,
          whatsappNumber: tenantUser.whatsappNumber,
          sendEmail: Boolean(tenantUser.preferences?.emailNotifications && tenantUser.preferences?.budgetAlerts),
          sendWhatsApp: Boolean(tenantUser.preferences?.budgetAlerts),
          subject,
          message,
          dedupeSince: startOfDay(now)
        }))
      );

      budgetAlerts.push({ category: category.name, reason: "spike" });
    }
  }

  if (tenantUser.preferences?.monthlyReports) {
    const reportDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthToken = reportDate.toISOString().slice(0, 7);
    const subject = `Relatório mensal ${reportDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;
    const report = await getFinanceReport(
      tenantId,
      {
        from: `${monthToken}-01`,
        to: new Date(reportDate.getFullYear(), reportDate.getMonth() + 1, 0).toISOString().slice(0, 10)
      }
    );
    const message =
      `Resumo do período: receitas ${formatCurrency(report.summary.income)}, ` +
      `despesas ${formatCurrency(report.summary.expense)} e saldo ${formatCurrency(report.summary.balance)}.` +
      (report.spendingInsights.topCategory
        ? ` Maior categoria: ${report.spendingInsights.topCategory.name} com ${formatCurrency(report.spendingInsights.topCategory.total)}.`
        : "");

    notificationDeliveries.push(
      ...(await sendUserNotifications({
        tenantId,
        userId: tenantUser.id,
        email: tenantUser.email,
        whatsappNumber: tenantUser.whatsappNumber,
        sendEmail: Boolean(tenantUser.preferences?.emailNotifications),
        sendWhatsApp: false,
        subject,
        message,
        dedupeSince: startOfMonth(now)
      }))
    );
  }

  return {
    processedSubscriptions: results.length,
    reminders: reminders.length,
    subscriptionResults: results,
    goalReminders: reminders,
    budgetAlerts,
    notificationDeliveries
  };
}
