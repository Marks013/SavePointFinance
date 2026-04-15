import { type PrismaClient } from "@prisma/client";

import { buildCardBillingSnapshot } from "@/lib/cards/statement";
import { prisma } from "@/lib/prisma/client";

type SnapshotSyncClient = Pick<PrismaClient, "$transaction" | "transaction">;

type SnapshotCard = {
  closeDay: number;
  dueDay: number;
  statementMonthAnchor: "close_month" | "previous_month";
};

function getPersistedSnapshotValues(card: SnapshotCard, date: Date) {
  const snapshot = buildCardBillingSnapshot(card, date);

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

  await client.$transaction(
    pending
      .filter((transaction) => transaction.card)
      .map((transaction) =>
        client.transaction.update({
          where: {
            id: transaction.id
          },
          data: getPersistedSnapshotValues(transaction.card!, transaction.date)
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

  await client.$transaction(
    cardTransactions
      .filter((transaction) => transaction.card)
      .map((transaction) =>
        client.transaction.update({
          where: {
            id: transaction.id
          },
          data: getPersistedSnapshotValues(transaction.card!, transaction.date)
        })
      )
  );

  return cardTransactions.length;
}
