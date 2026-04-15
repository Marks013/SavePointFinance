import { prisma } from "@/lib/prisma/client";

export class TenantReferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantReferenceError";
  }
}

function normalizeReferenceId(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized || null;
}

async function assertReferenceExists(
  label: string,
  referenceId: string | null | undefined,
  exists: (id: string) => Promise<boolean>
) {
  const normalizedId = normalizeReferenceId(referenceId);

  if (!normalizedId) {
    return;
  }

  if (!(await exists(normalizedId))) {
    throw new TenantReferenceError(`${label} nao pertence a esta carteira`);
  }
}

export async function assertTenantAccountReference(tenantId: string, accountId: string | null | undefined, label = "Conta") {
  await assertReferenceExists(label, accountId, async (id) => {
    const account = await prisma.financialAccount.findFirst({
      where: {
        id,
        tenantId
      },
      select: {
        id: true
      }
    });

    return Boolean(account);
  });
}

export async function assertTenantCardReference(tenantId: string, cardId: string | null | undefined, label = "Cartao") {
  await assertReferenceExists(label, cardId, async (id) => {
    const card = await prisma.card.findFirst({
      where: {
        id,
        tenantId
      },
      select: {
        id: true
      }
    });

    return Boolean(card);
  });
}

export async function assertTenantCategoryReference(
  tenantId: string,
  categoryId: string | null | undefined,
  label = "Categoria"
) {
  await assertReferenceExists(label, categoryId, async (id) => {
    const category = await prisma.category.findFirst({
      where: {
        id,
        tenantId
      },
      select: {
        id: true
      }
    });

    return Boolean(category);
  });
}

export async function assertTenantTransactionReferences({
  tenantId,
  accountId,
  destinationAccountId,
  cardId,
  categoryId
}: {
  tenantId: string;
  accountId?: string | null;
  destinationAccountId?: string | null;
  cardId?: string | null;
  categoryId?: string | null;
}) {
  await Promise.all([
    assertTenantAccountReference(tenantId, accountId, "Conta de origem"),
    assertTenantAccountReference(tenantId, destinationAccountId, "Conta de destino"),
    assertTenantCardReference(tenantId, cardId),
    assertTenantCategoryReference(tenantId, categoryId)
  ]);
}
