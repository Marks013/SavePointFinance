import "dotenv/config";

import { Client } from "pg";

import { prisma } from "../lib/prisma/client";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  plan: "free" | "pro";
  max_users: number;
  is_active: boolean;
  trial_start: Date | null;
  trial_days: number;
  trial_expires_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type UserRow = {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "admin" | "member";
  whatsapp_number: string | null;
  is_active: boolean;
  last_login: Date | null;
  login_count: number;
  reset_token: string | null;
  reset_token_expires: Date | null;
  created_at: Date;
  updated_at: Date;
};

type PreferenceRow = {
  id: string;
  user_id: string;
  currency: string;
  date_format: string;
  email_notifications: boolean;
  monthly_reports: boolean;
  budget_alerts: boolean;
  due_reminders: boolean;
  auto_tithe: boolean;
  created_at: Date;
  updated_at: Date;
};

type CategoryRow = {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  icon: string;
  color: string;
  type: "income" | "expense";
  keywords: string[] | null;
  monthly_limit: string | null;
  is_default: boolean;
  created_at: Date;
};

type AccountRow = {
  id: string;
  tenant_id: string;
  name: string;
  type: "checking" | "savings" | "investment" | "wallet";
  balance: string;
  currency: string;
  color: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

type CardRow = {
  id: string;
  tenant_id: string;
  name: string;
  last4: string | null;
  brand: string;
  limit_amount: string;
  due_day: number;
  close_day: number;
  color: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

type GoalRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  account_id: string | null;
  name: string;
  target_amount: string;
  current_amount: string;
  deadline: Date | null;
  color: string;
  icon: string | null;
  notify_on_complete: boolean;
  notify_on_milestone_25: boolean;
  notify_on_milestone_50: boolean;
  notify_on_milestone_75: boolean;
  notify_on_deadline: boolean;
  last_notified_at: Date | null;
  is_completed: boolean;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type SubscriptionRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  category_id: string | null;
  account_id: string | null;
  card_id: string | null;
  name: string;
  type: "income" | "expense";
  amount: string;
  billing_day: number;
  is_active: boolean;
  next_billing_date: Date;
  created_at: Date;
  updated_at: Date;
};

type TransactionRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  category_id: string | null;
  account_id: string | null;
  card_id: string | null;
  date: Date;
  amount: string;
  description: string;
  notes: string | null;
  type: "income" | "expense" | "transfer";
  source: "manual" | "whatsapp" | "import_csv" | "import_ofx";
  payment_method: "pix" | "money" | "credit_card" | "debit_card" | "transfer";
  installments_total: number;
  installment_number: number;
  parent_id: string | null;
  ai_classified: boolean;
  ai_confidence: string | null;
  tithe_amount: string | null;
  tithe_category_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function asMidday(date: Date | null) {
  if (!date) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;

  if (!legacyUrl) {
    throw new Error("LEGACY_DATABASE_URL is not configured.");
  }

  const legacy = new Client({
    connectionString: legacyUrl
  });

  await legacy.connect();

  try {
    const tenants = (await legacy.query<TenantRow>("select * from tenants order by created_at asc")).rows;
    const users = (await legacy.query<UserRow>("select * from users order by created_at asc")).rows;
    const preferences = (await legacy.query<PreferenceRow>("select * from user_preferences order by created_at asc")).rows;
    const categories = (await legacy.query<CategoryRow>("select * from categories order by created_at asc")).rows;
    const accounts = (await legacy.query<AccountRow>("select * from accounts order by created_at asc")).rows;
    const cards = (await legacy.query<CardRow>("select * from cards order by created_at asc")).rows;
    const goals = (await legacy.query<GoalRow>("select * from goals order by created_at asc")).rows;
    const subscriptions = (await legacy.query<SubscriptionRow>("select * from subscriptions order by created_at asc")).rows;
    const transactions = (await legacy.query<TransactionRow>("select * from transactions order by created_at asc")).rows;
    const primaryUserByTenant = new Map<string, string>();

    for (const user of users) {
      const current = primaryUserByTenant.get(user.tenant_id);
      if (!current || user.role === "admin") {
        primaryUserByTenant.set(user.tenant_id, user.id);
      }
    }

    for (const tenant of tenants) {
      await prisma.tenant.upsert({
        where: { id: tenant.id },
        update: {
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          maxUsers: tenant.max_users,
          isActive: tenant.is_active,
          trialStart: tenant.trial_start,
          trialDays: tenant.trial_days,
          trialExpiresAt: tenant.trial_expires_at,
          expiresAt: tenant.expires_at,
          updatedAt: tenant.updated_at
        },
        create: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          maxUsers: tenant.max_users,
          isActive: tenant.is_active,
          trialStart: tenant.trial_start,
          trialDays: tenant.trial_days,
          trialExpiresAt: tenant.trial_expires_at,
          expiresAt: tenant.expires_at,
          createdAt: tenant.created_at,
          updatedAt: tenant.updated_at
        }
      });
    }

    for (const user of users) {
      await prisma.user.upsert({
        where: { id: user.id },
        update: {
          tenantId: user.tenant_id,
          email: user.email,
          name: user.name,
          passwordHash: user.password_hash,
          role: user.role,
          whatsappNumber: user.whatsapp_number,
          isActive: user.is_active,
          lastLogin: user.last_login,
          loginCount: user.login_count,
          resetToken: user.reset_token,
          resetTokenExpires: user.reset_token_expires,
          updatedAt: user.updated_at
        },
        create: {
          id: user.id,
          tenantId: user.tenant_id,
          email: user.email,
          name: user.name,
          passwordHash: user.password_hash,
          role: user.role,
          whatsappNumber: user.whatsapp_number,
          isActive: user.is_active,
          lastLogin: user.last_login,
          loginCount: user.login_count,
          resetToken: user.reset_token,
          resetTokenExpires: user.reset_token_expires,
          createdAt: user.created_at,
          updatedAt: user.updated_at
        }
      });
    }

    for (const preference of preferences) {
      await prisma.userPreference.upsert({
        where: { userId: preference.user_id },
        update: {
          currency: preference.currency,
          dateFormat: preference.date_format,
          emailNotifications: preference.email_notifications,
          monthlyReports: preference.monthly_reports,
          budgetAlerts: preference.budget_alerts,
          dueReminders: preference.due_reminders,
          autoTithe: preference.auto_tithe,
          updatedAt: preference.updated_at
        },
        create: {
          id: preference.id,
          userId: preference.user_id,
          currency: preference.currency,
          dateFormat: preference.date_format,
          emailNotifications: preference.email_notifications,
          monthlyReports: preference.monthly_reports,
          budgetAlerts: preference.budget_alerts,
          dueReminders: preference.due_reminders,
          autoTithe: preference.auto_tithe,
          createdAt: preference.created_at,
          updatedAt: preference.updated_at
        }
      });
    }

    for (const category of categories) {
      await prisma.category.upsert({
        where: { id: category.id },
        update: {
          tenantId: category.tenant_id,
          parentId: category.parent_id,
          name: category.name,
          icon: category.icon,
          color: category.color,
          type: category.type,
          keywords: category.keywords ?? [],
          monthlyLimit: category.monthly_limit,
          isDefault: category.is_default
        },
        create: {
          id: category.id,
          tenantId: category.tenant_id,
          parentId: category.parent_id,
          name: category.name,
          icon: category.icon,
          color: category.color,
          type: category.type,
          keywords: category.keywords ?? [],
          monthlyLimit: category.monthly_limit,
          isDefault: category.is_default,
          createdAt: category.created_at
        }
      });
    }

    for (const account of accounts) {
      const ownerUserId = primaryUserByTenant.get(account.tenant_id);
      if (!ownerUserId) {
        continue;
      }

      await prisma.financialAccount.upsert({
        where: { id: account.id },
        update: {
          tenantId: account.tenant_id,
          ownerUserId,
          name: account.name,
          type: account.type,
          balance: account.balance,
          currency: account.currency,
          color: account.color,
          isActive: account.is_active,
          updatedAt: account.updated_at
        },
        create: {
          id: account.id,
          tenantId: account.tenant_id,
          ownerUserId,
          name: account.name,
          type: account.type,
          balance: account.balance,
          currency: account.currency,
          color: account.color,
          isActive: account.is_active,
          createdAt: account.created_at,
          updatedAt: account.updated_at
        }
      });
    }

    for (const card of cards) {
      const ownerUserId = primaryUserByTenant.get(card.tenant_id);
      if (!ownerUserId) {
        continue;
      }

      await prisma.card.upsert({
        where: { id: card.id },
        update: {
          tenantId: card.tenant_id,
          ownerUserId,
          name: card.name,
          last4: card.last4,
          brand: card.brand,
          limitAmount: card.limit_amount,
          dueDay: card.due_day,
          closeDay: card.close_day,
          color: card.color,
          isActive: card.is_active,
          updatedAt: card.updated_at
        },
        create: {
          id: card.id,
          tenantId: card.tenant_id,
          ownerUserId,
          name: card.name,
          last4: card.last4,
          brand: card.brand,
          limitAmount: card.limit_amount,
          dueDay: card.due_day,
          closeDay: card.close_day,
          color: card.color,
          isActive: card.is_active,
          createdAt: card.created_at,
          updatedAt: card.updated_at
        }
      });
    }

    for (const goal of goals) {
      await prisma.goal.upsert({
        where: { id: goal.id },
        update: {
          tenantId: goal.tenant_id,
          userId: goal.user_id,
          accountId: goal.account_id,
          name: goal.name,
          targetAmount: goal.target_amount,
          currentAmount: goal.current_amount,
          deadline: asMidday(goal.deadline),
          color: goal.color,
          icon: goal.icon,
          notifyOnComplete: goal.notify_on_complete,
          milestone25: goal.notify_on_milestone_25 ? "enabled" : "disabled",
          milestone50: goal.notify_on_milestone_50 ? "enabled" : "disabled",
          milestone75: goal.notify_on_milestone_75 ? "enabled" : "disabled",
          notifyOnDeadline: goal.notify_on_deadline,
          lastNotifiedAt: goal.last_notified_at,
          isCompleted: goal.is_completed,
          completedAt: goal.completed_at,
          updatedAt: goal.updated_at
        },
        create: {
          id: goal.id,
          tenantId: goal.tenant_id,
          userId: goal.user_id,
          accountId: goal.account_id,
          name: goal.name,
          targetAmount: goal.target_amount,
          currentAmount: goal.current_amount,
          deadline: asMidday(goal.deadline),
          color: goal.color,
          icon: goal.icon,
          notifyOnComplete: goal.notify_on_complete,
          milestone25: goal.notify_on_milestone_25 ? "enabled" : "disabled",
          milestone50: goal.notify_on_milestone_50 ? "enabled" : "disabled",
          milestone75: goal.notify_on_milestone_75 ? "enabled" : "disabled",
          notifyOnDeadline: goal.notify_on_deadline,
          lastNotifiedAt: goal.last_notified_at,
          isCompleted: goal.is_completed,
          completedAt: goal.completed_at,
          createdAt: goal.created_at,
          updatedAt: goal.updated_at
        }
      });
    }

    for (const subscription of subscriptions) {
      await prisma.subscription.upsert({
        where: { id: subscription.id },
        update: {
          tenantId: subscription.tenant_id,
          userId: subscription.user_id,
          categoryId: subscription.category_id,
          accountId: subscription.account_id,
          cardId: subscription.card_id,
          name: subscription.name,
          type: subscription.type,
          amount: subscription.amount,
          billingDay: subscription.billing_day,
          isActive: subscription.is_active,
          nextBillingDate: asMidday(subscription.next_billing_date) ?? new Date(),
          updatedAt: subscription.updated_at
        },
        create: {
          id: subscription.id,
          tenantId: subscription.tenant_id,
          userId: subscription.user_id,
          categoryId: subscription.category_id,
          accountId: subscription.account_id,
          cardId: subscription.card_id,
          name: subscription.name,
          type: subscription.type,
          amount: subscription.amount,
          billingDay: subscription.billing_day,
          isActive: subscription.is_active,
          nextBillingDate: asMidday(subscription.next_billing_date) ?? new Date(),
          createdAt: subscription.created_at,
          updatedAt: subscription.updated_at
        }
      });
    }

    for (const transaction of transactions) {
      await prisma.transaction.upsert({
        where: { id: transaction.id },
        update: {
          tenantId: transaction.tenant_id,
          userId: transaction.user_id,
          categoryId: transaction.category_id,
          accountId: transaction.account_id,
          cardId: transaction.card_id,
          date: asMidday(transaction.date) ?? new Date(),
          amount: transaction.amount,
          description: transaction.description,
          notes: transaction.notes,
          type: transaction.type,
          source: transaction.source,
          paymentMethod: transaction.payment_method,
          installmentsTotal: transaction.installments_total,
          installmentNumber: transaction.installment_number,
          parentId: transaction.parent_id,
          aiClassified: transaction.ai_classified,
          aiConfidence: transaction.ai_confidence,
          titheAmount: transaction.tithe_amount,
          titheCategoryId: transaction.tithe_category_id,
          updatedAt: transaction.updated_at
        },
        create: {
          id: transaction.id,
          tenantId: transaction.tenant_id,
          userId: transaction.user_id,
          categoryId: transaction.category_id,
          accountId: transaction.account_id,
          cardId: transaction.card_id,
          date: asMidday(transaction.date) ?? new Date(),
          amount: transaction.amount,
          description: transaction.description,
          notes: transaction.notes,
          type: transaction.type,
          source: transaction.source,
          paymentMethod: transaction.payment_method,
          installmentsTotal: transaction.installments_total,
          installmentNumber: transaction.installment_number,
          parentId: transaction.parent_id,
          aiClassified: transaction.ai_classified,
          aiConfidence: transaction.ai_confidence,
          titheAmount: transaction.tithe_amount,
          titheCategoryId: transaction.tithe_category_id,
          createdAt: transaction.created_at,
          updatedAt: transaction.updated_at
        }
      });
    }

    console.log(
      JSON.stringify(
        {
          imported: {
            tenants: tenants.length,
            users: users.length,
            preferences: preferences.length,
            categories: categories.length,
            accounts: accounts.length,
            cards: cards.length,
            goals: goals.length,
            subscriptions: subscriptions.length,
            transactions: transactions.length
          }
        },
        null,
        2
      )
    );
  } finally {
    await legacy.end();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
