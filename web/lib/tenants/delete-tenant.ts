import { BusinessRuleError } from "@/lib/observability/errors";
import { prisma } from "@/lib/prisma/client";

type DeleteTenantOptions = {
  tenantId: string;
};

type DeleteTenantResult = {
  id: string;
  name: string;
  slug: string;
  activeUsers: number;
  totalUsers: number;
};

export async function getDeletableTenant(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      users: {
        select: {
          id: true,
          isActive: true,
          isPlatformAdmin: true
        }
      }
    }
  });

  if (!tenant) {
    return null;
  }

  if (tenant.users.some((user) => user.isPlatformAdmin)) {
    throw new BusinessRuleError("A conta principal da plataforma não pode ser excluída por este fluxo.");
  }

  return tenant;
}

export async function deleteTenantWithAllData(options: DeleteTenantOptions): Promise<DeleteTenantResult> {
  const tenant = await getDeletableTenant(options.tenantId);

  if (!tenant) {
    throw new BusinessRuleError("Conta não encontrada");
  }

  await prisma.tenant.delete({
    where: { id: tenant.id }
  });

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    activeUsers: tenant.users.filter((user) => user.isActive).length,
    totalUsers: tenant.users.length
  };
}
