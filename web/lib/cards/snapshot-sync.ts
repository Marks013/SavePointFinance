import { type PrismaClient } from "@prisma/client";

import { buildCardBillingSnapshotForDate } from "@/lib/cards/statement";
import { prisma } from "@/lib/prisma/client";

type SnapshotSyncClient = Pick<PrismaClient, "transaction" | "statementPayment" | "cardStatementCycle">;

type SnapshotCard = {
  id: string;
  closeDay: number;
  dueDay: number;
  statementMonthAnchor: "close_month" | "previous_month";
};

async function getPersistedSnapshotValues(tenantId: string, card: SnapshotCard, date: Date, client: SnapshotSyncClient) {
  const snapshot = await buildCardBillingSnapshotForDate({
    tenantId,
    card,
    referenceDate: date,
    client
  });

  return {
    competence: snapshot.competence,
    statementCloseDate: snapshot.closeDate,
    statementDueDate: snapshot.dueDate
  };
}

export async function ensureTenantCardStatementSnapshots(
  tenantId: string,
  client: SnapshotSyncClient = prisma
) {
  const pending = await client.transaction.findMany({
    where: {
      tenantId,
      cardId: {
        not: null
      },
      OR: [{ statementCloseDate: null }, { statementDueDate: null }]
    },
    select: {
      id: true,
      date: true,
      card: {
        select: {
          id: true,
          closeDay: true,
          dueDay: true,
          statementMonthAnchor: true
        }
      }
    }
  });

  if (!pending.length) {
    return 0;
  }

  await Promise.all(
    pending
      .filter((transaction): transaction is typeof transaction & { card: SnapshotCard } => Boolean(transaction.card))
      .map(async (transaction) =>
        client.transaction.update({
          where: {
            id: transaction.id
          },
          data: await getPersistedSnapshotValues(tenantId, transaction.card, transaction.date, client)
        })
      )
  );

  return pending.length;
}

export async function freezeCardStatementSnapshotsBeforeCardUpdate(
  tenantId: string,
  cardId: string,
  client: SnapshotSyncClient = prisma
) {
  const cardTransactions = await client.transaction.findMany({
    where: {
      tenantId,
      cardId,
      OR: [{ statementCloseDate: null }, { statementDueDate: null }]
    },
    select: {
      id: true,
      date: true,
      card: {
        select: {
          id: true,
          closeDay: true,
          dueDay: true,
          statementMonthAnchor: true
        }
      }
    }
  });

  if (!cardTransactions.length) {
    return 0;
  }

  await Promise.all(
    cardTransactions
      .filter((transaction): transaction is typeof transaction & { card: SnapshotCard } => Boolean(transaction.card))
      .map(async (transaction) =>
        client.transaction.update({
          where: {
            id: transaction.id
          },
          data: await getPersistedSnapshotValues(tenantId, transaction.card, transaction.date, client)
        })
      )
  );

  return cardTransactions.length;
}

export async function recomputeCardStatementSnapshots(
  tenantId: string,
  cardId: string,
  client: SnapshotSyncClient = prisma
) {
  const cardTransactions = await client.transaction.findMany({
    where: {
      tenantId,
      cardId
    },
    select: {
      id: true,
      date: true,
      card: {
        select: {
          id: true,
          closeDay: true,
          dueDay: true,
          statementMonthAnchor: true
        }
      }
    }
  });

  const operations = await Promise.all(
    cardTransactions
      .filter((transaction): transaction is typeof transaction & { card: SnapshotCard } => Boolean(transaction.card))
      .map(async (transaction) =>
        client.transaction.update({
          where: {
            id: transaction.id
          },
          data: await getPersistedSnapshotValues(tenantId, transaction.card, transaction.date, client)
        })
      )
  );

  if (!operations.length) {
    return 0;
  }

  return operations.length;
}
