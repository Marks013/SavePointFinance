"use client";

import Link from "next/link";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { invitationSchema, type InvitationValues } from "@/features/password/schemas/password-schema";
import { formatDateDisplay, formatDateTimeDisplay, parseBrazilianDateToDateKey } from "@/lib/date";
import { formatRoleFilterLabel, formatRoleLabel } from "@/lib/users/role-label";

type Stats = {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  expiredTenants: number;
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
  billingActiveSubscriptions: number;
  billingAttentionSubscriptions: number;
  billingWebhookQueueDepth: number;
  billingWebhookFailures: number;
  currentTenantUsers: number;
  currentTenantActiveUsers: number;
};

type TenantBillingSummary = {
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  preapprovalId: string | null;
  nextBillingAt: string | null;
  cancelRequestedAt: string | null;
  lastSyncedAt: string | null;
  latestPaymentStatus: string | null;
  latestPaymentId: string | null;
  queueDepth: number;
  failedWebhooks: number;
  lastFinancialRepair: {
    action: string;
    summary: string;
    createdAt: string;
  } | null;
};

type TenantBillingDetails = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    planId: string;
    expiresAt: string | null;
    trialExpiresAt: string | null;
  };
  subscription: {
    id: string;
    status: string;
    reason: string;
    mercadoPagoPreapprovalId: string | null;
    payerEmail: string;
    nextBillingAt: string | null;
    cancelRequestedAt: string | null;
    canceledAt: string | null;
    lastSyncedAt: string | null;
    createdAt: string;
    updatedAt: string;
    payments: Array<{
      id: string;
      providerPaymentId: string;
      status: string;
      amount: number;
      approvedAt: string | null;
      refundedAt: string | null;
      refundStatus: string | null;
      createdAt: string;
    }>;
  } | null;
  webhookEvents: Array<{
    id: string;
    topic: string;
    status: string;
    error: string | null;
    attempts: number;
    nextAttemptAt: string | null;
    processedAt: string | null;
    createdAt: string;
  }>;
};

type TenantItem = {
  id: string;
  name: string;
  slug: string;
  planId: string;
  planName: string;
  planSlug: string;
  planTier: "free" | "pro";
  isActive: boolean;
  activeUsers: number;
  trialStart: string | null;
  trialDays: number;
  trialExpiresAt: string | null;
  expiresAt: string | null;
  billing: TenantBillingSummary;
};

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  isPlatformAdmin?: boolean;
  isActive: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
    accountAdminId: string | null;
    accountAdminName: string | null;
    accountAdminEmail: string | null;
    planId: string;
    planName: string;
    planSlug: string;
    planTier: "free" | "pro";
    isActive: boolean;
    trialExpiresAt: string | null;
    expiresAt: string | null;
  };
  createdAt: string;
  lastLogin: string | null;
};

type UserListResponse = {
  items: UserItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type InvitationItem = {
  id: string;
  tenantId?: string;
  email: string;
  name: string;
  role: "admin" | "member";
  inviteUrl: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

type InvitationCreateResponse = {
  inviteUrl: string;
  emailDelivery?: {
    status: "pending" | "sent" | "failed" | "skipped";
    errorMessage: string | null;
    attemptedAt: string | null;
  };
};

type AuditItem = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorUser: {
    id: string;
    name: string;
    email: string;
  };
  targetUser: {
    id: string;
    name: string;
    email: string;
  } | null;
  targetTenant: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

type CurrentProfile = {
  isPlatformAdmin: boolean;
};

type PlanItem = {
  id: string;
  name: string;
  slug: string;
  tier: "free" | "pro";
  description: string | null;
  maxAccounts: number | null;
  maxCards: number | null;
  trialDays: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  tenantsCount: number;
  features: {
    whatsappAssistant: boolean;
    automation: boolean;
    pdfExport: boolean;
  };
};

function formatPlanLabel(plan: string) {
  return plan === "pro" ? "Premium" : "Gratuito";
}

function formatLifecycleLabel(tenant: TenantItem) {
  if (tenant.expiresAt) {
    return `Expira em ${formatDateDisplay(tenant.expiresAt)}`;
  }

  if (tenant.planTier === "pro" && tenant.trialExpiresAt) {
    return `Avaliação até ${formatDateDisplay(tenant.trialExpiresAt)}`;
  }

  return tenant.isActive ? "Sem vencimento configurado" : "Conta inativa";
}

function formatBillingSubscriptionLabel(status: string | null) {
  switch (status) {
    case "authorized":
      return "Assinatura ativa";
    case "payment_required":
      return "Pagamento pendente";
    case "paused":
      return "Cobrança pausada";
    case "pending":
      return "Aguardando autorização";
    case "canceled":
      return "Assinatura cancelada";
    case "expired":
      return "Assinatura expirada";
    case "rejected":
      return "Assinatura recusada";
    default:
      return "Sem assinatura Mercado Pago";
  }
}

function formatUserTenantPlanLabel(user: UserItem) {
  if (user.tenant.expiresAt) {
    return `${user.tenant.planName} • Expirado`;
  }

  if (user.tenant.planTier === "pro" && user.tenant.trialExpiresAt) {
    return `${user.tenant.planName} • Em avaliação`;
  }

  return `${user.tenant.planName} • ${user.tenant.isActive ? "Ativo" : "Inativo"}`;
}

function toAbsoluteInviteUrl(inviteUrl: string) {
  if (typeof window === "undefined") {
    return inviteUrl;
  }

  return new URL(inviteUrl, window.location.origin).toString();
}

function buildQuery(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

function parseNullableLimit(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function getStats() {
  const response = await fetch("/api/admin/stats", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar stats");
  return (await response.json()) as Stats;
}

async function getTenants(filters: { search?: string; plan?: string; status?: string }) {
  const response = await fetch(`/api/admin/tenants${buildQuery(filters)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar contas");
  return (await response.json()) as { items: TenantItem[] };
}

async function getTenantBillingDetails(tenantId: string) {
  const response = await fetch(`/api/admin/tenants/${tenantId}/billing`, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar detalhes financeiros da conta");
  return (await response.json()) as TenantBillingDetails;
}

async function getPlans(filters: { search?: string; tier?: string; status?: string }) {
  const response = await fetch(`/api/admin/plans${buildQuery(filters)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar planos");
  return (await response.json()) as { items: PlanItem[] };
}

async function getUsers(filters: {
  search?: string;
  tenantId?: string;
  role?: string;
  status?: string;
  lastLogin?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
}) {
  const response = await fetch(`/api/admin/users${buildQuery(filters)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar usuários");
  return (await response.json()) as UserListResponse;
}

async function getInvitations(filters: { search?: string; tenantId?: string }) {
  const response = await fetch(`/api/admin/invitations${buildQuery(filters)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar convites");
  return (await response.json()) as { items: InvitationItem[] };
}

async function getAudit(filters: { search?: string; tenantId?: string; action?: string }) {
  const response = await fetch(`/api/admin/audit${buildQuery(filters)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar auditoria");
  return (await response.json()) as { items: AuditItem[] };
}

async function getCurrentProfile() {
  const response = await fetch("/api/profile", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar perfil");
  return (await response.json()) as CurrentProfile;
}

export function AdminClient() {
  const queryClient = useQueryClient();
  const [tenantPlanDrafts, setTenantPlanDrafts] = useState<Record<string, string>>({});
  const [userTenantDrafts, setUserTenantDrafts] = useState<Record<string, string>>({});
  const [planNameDrafts, setPlanNameDrafts] = useState<Record<string, string>>({});
  const [planDescriptionDrafts, setPlanDescriptionDrafts] = useState<Record<string, string>>({});
  const [planMaxAccountsDrafts, setPlanMaxAccountsDrafts] = useState<Record<string, string>>({});
  const [planMaxCardsDrafts, setPlanMaxCardsDrafts] = useState<Record<string, string>>({});
  const [planTrialDaysDrafts, setPlanTrialDaysDrafts] = useState<Record<string, string>>({});
  const [newPlanName, setNewPlanName] = useState("");
  const [newPlanSlug, setNewPlanSlug] = useState("");
  const [newPlanTier, setNewPlanTier] = useState<"free" | "pro">("free");
  const [newPlanDescription, setNewPlanDescription] = useState("");
  const [newPlanMaxAccounts, setNewPlanMaxAccounts] = useState("");
  const [newPlanMaxCards, setNewPlanMaxCards] = useState("");
  const [newPlanTrialDays, setNewPlanTrialDays] = useState("0");
  const [newPlanWhatsapp, setNewPlanWhatsapp] = useState(false);
  const [newPlanAutomation, setNewPlanAutomation] = useState(false);
  const [newPlanPdfExport, setNewPlanPdfExport] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [newTenantPlanId, setNewTenantPlanId] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantPlanFilter, setTenantPlanFilter] = useState("");
  const [tenantStatusFilter, setTenantStatusFilter] = useState("");
  const [expandedTenantBillingId, setExpandedTenantBillingId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userTenantFilter, setUserTenantFilter] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("");
  const [userLastLoginFilter, setUserLastLoginFilter] = useState("");
  const [userSort, setUserSort] = useState("created_desc");
  const [userPage, setUserPage] = useState(1);
  const [invitePlanId, setInvitePlanId] = useState("");
  const [invitationSearch, setInvitationSearch] = useState("");
  const [invitationTenantFilter, setInvitationTenantFilter] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditTenantFilter, setAuditTenantFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [tenantTitheDrafts, setTenantTitheDrafts] = useState<Record<string, string>>({});
  const [tenantTrialDrafts, setTenantTrialDrafts] = useState<Record<string, string>>({});
  const [tenantExpiryDrafts, setTenantExpiryDrafts] = useState<Record<string, string>>({});
  const [tenantDeleteConfirmDrafts, setTenantDeleteConfirmDrafts] = useState<Record<string, string>>({});
  const [userPasswordDrafts, setUserPasswordDrafts] = useState<Record<string, string>>({});
  const [userDeleteConfirmDrafts, setUserDeleteConfirmDrafts] = useState<Record<string, string>>({});
  const invitationForm = useForm<z.input<typeof invitationSchema>, unknown, InvitationValues>({
    resolver: zodResolver(invitationSchema),
    defaultValues: {
      email: "",
      name: "",
      role: "admin"
    }
  });
  const statsQuery = useQuery({ queryKey: ["admin-stats"], queryFn: getStats });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getCurrentProfile });
  const plansQuery = useQuery({
    queryKey: ["admin-plans"],
    queryFn: () => getPlans({})
  });
  const tenantsQuery = useQuery({
    queryKey: ["admin-tenants", tenantSearch, tenantPlanFilter, tenantStatusFilter],
    queryFn: () =>
      getTenants({
        search: tenantSearch || undefined,
        plan: tenantPlanFilter || undefined,
        status: tenantStatusFilter || undefined
      })
  });
  const tenantBillingDetailsQuery = useQuery({
    queryKey: ["admin-tenant-billing", expandedTenantBillingId],
    queryFn: () => getTenantBillingDetails(expandedTenantBillingId!),
    enabled: Boolean(expandedTenantBillingId)
  });
  const usersQuery = useQuery({
    queryKey: [
      "admin-users",
      userSearch,
      userTenantFilter,
      userRoleFilter,
      userStatusFilter,
      userLastLoginFilter,
      userSort,
      userPage
    ],
    queryFn: () =>
      getUsers({
        search: userSearch || undefined,
        tenantId: userTenantFilter || undefined,
        role: userRoleFilter || undefined,
        status: userStatusFilter || undefined,
        lastLogin: userLastLoginFilter || undefined,
        sort: userSort,
        page: String(userPage),
        pageSize: "12"
      })
  });
  const invitationsQuery = useQuery({
    queryKey: ["admin-invitations", invitationSearch, invitationTenantFilter],
    queryFn: () =>
      getInvitations({
        search: invitationSearch || undefined,
        tenantId: invitationTenantFilter || undefined
      })
  });
  const auditQuery = useQuery({
    queryKey: ["admin-audit", auditSearch, auditTenantFilter, auditActionFilter],
    queryFn: () =>
      getAudit({
        search: auditSearch || undefined,
        tenantId: auditTenantFilter || undefined,
        action: auditActionFilter || undefined
      })
  });
  const plans = plansQuery.data?.items ?? [];
  const tenants = tenantsQuery.data?.items ?? [];
  const users = usersQuery.data?.items ?? [];
  const usersMeta = usersQuery.data;
  const invitations = invitationsQuery.data?.items ?? [];
  const auditItems = auditQuery.data?.items ?? [];
  const isPlatformAdmin = Boolean(profileQuery.data?.isPlatformAdmin);

  function getTenantLabel(tenant: TenantItem) {
    return `${tenant.name} • ${tenant.planName}`;
  }

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, newPassword }: { id: string; newPassword: string }) => {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword })
      });
      if (!response.ok) throw new Error("Falha ao resetar senha");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      toast.success("Senha atualizada");
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive })
      });
      if (!response.ok) throw new Error("Falha ao atualizar pessoa");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success("Usuário atualizado");
    }
  });

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: "admin" | "member" }) => {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      if (!response.ok) throw new Error("Falha ao atualizar perfil");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      toast.success("Perfil da pessoa atualizado");
    }
  });

  const moveUserTenantMutation = useMutation({
    mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Falha ao alterar a conta da pessoa");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success("Conta da pessoa atualizada");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE"
      });

      const payload = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao excluir pessoa");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success("Usuário excluído definitivamente");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const createPlanMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPlanName,
          slug: newPlanSlug,
          tier: newPlanTier,
          description: newPlanDescription,
          maxAccounts: parseNullableLimit(newPlanMaxAccounts),
          maxCards: parseNullableLimit(newPlanMaxCards),
          trialDays: Number(newPlanTrialDays) || 0,
          whatsappAssistant: newPlanWhatsapp,
          automation: newPlanAutomation,
          pdfExport: newPlanPdfExport
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Falha ao criar plano");
      }
    },
    onSuccess: async () => {
      setNewPlanName("");
      setNewPlanSlug("");
      setNewPlanTier("free");
      setNewPlanDescription("");
      setNewPlanMaxAccounts("");
      setNewPlanMaxCards("");
      setNewPlanTrialDays("0");
      setNewPlanWhatsapp(false);
      setNewPlanAutomation(false);
      setNewPlanPdfExport(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-plans"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success("Plano criado");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const updatePlanMutation = useMutation({
    mutationFn: async ({
      id,
      data
    }: {
      id: string;
      data: Record<string, unknown>;
    }) => {
      const response = await fetch(`/api/admin/plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Falha ao atualizar plano");
      }
    },
    onMutate: async ({ id, data }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ["admin-plans"] }),
        queryClient.cancelQueries({ queryKey: ["admin-tenants"] })
      ]);

      const previousPlans = queryClient.getQueryData<{ items: PlanItem[] }>(["admin-plans"]);

      queryClient.setQueryData<{ items: PlanItem[] }>(["admin-plans"], (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: current.items.map((plan) =>
            plan.id === id
              ? {
                  ...plan,
                  ...(data.name !== undefined ? { name: String(data.name) } : {}),
                  ...(data.description !== undefined
                    ? { description: data.description === null ? null : String(data.description) }
                    : {}),
                  ...(data.tier !== undefined ? { tier: data.tier as "free" | "pro" } : {}),
                  ...(data.maxAccounts !== undefined ? { maxAccounts: data.maxAccounts as number | null } : {}),
                  ...(data.maxCards !== undefined ? { maxCards: data.maxCards as number | null } : {}),
                  ...(data.trialDays !== undefined ? { trialDays: Number(data.trialDays) } : {}),
                  ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
                  features: {
                    ...plan.features,
                    ...(data.whatsappAssistant !== undefined
                      ? { whatsappAssistant: Boolean(data.whatsappAssistant) }
                      : {}),
                    ...(data.automation !== undefined ? { automation: Boolean(data.automation) } : {}),
                    ...(data.pdfExport !== undefined ? { pdfExport: Boolean(data.pdfExport) } : {})
                  }
                }
              : plan
          )
        };
      });

      return { previousPlans };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-plans"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success("Plano atualizado");
    },
    onError: (error, _variables, context) => {
      if (context?.previousPlans) {
        queryClient.setQueryData(["admin-plans"], context.previousPlans);
      }

      toast.error(error.message);
    }
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/plans/${id}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Falha ao excluir plano");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-plans"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success("Plano excluído");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({
      id,
      planId,
      isActive,
      trialDays,
      trialExpiresAt,
      expiresAt
    }: {
      id: string;
      planId?: string;
      isActive?: boolean;
      trialDays?: number;
      trialExpiresAt?: string | null;
      expiresAt?: string | null;
    }) => {
      const response = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, isActive, trialDays, trialExpiresAt, expiresAt })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message ?? "Falha ao atualizar conta");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success("Conta atualizada");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const createTenantMutation = useMutation({
    mutationFn: async () => {
      if (!newTenantPlanId) {
        throw new Error("Selecione o plano inicial da conta");
      }

      const response = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTenantName,
          slug: newTenantSlug,
          planId: newTenantPlanId
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Falha ao criar conta");
      }
    },
    onSuccess: async () => {
      setNewTenantName("");
      setNewTenantSlug("");
      setNewTenantPlanId("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success("Conta criada");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const deleteTenantMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/tenants/${id}`, {
        method: "DELETE"
      });

      const payload = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao excluir conta");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-invitations"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success("Conta excluída definitivamente");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const adminTenantBillingMutation = useMutation({
    mutationFn: async ({
      tenantId,
      action,
      monthKey
    }: {
      tenantId: string;
      action:
        | "sync_subscription"
        | "process_queue"
        | "recalculate_tithe_month"
        | "sync_due_subscriptions"
        | "reconcile_due_installments";
      monthKey?: string;
    }) => {
      const response = await fetch(`/api/admin/tenants/${tenantId}/billing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, monthKey })
      });

      const payload = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao executar ação de billing");
      }

      return payload;
    },
    onSuccess: async (payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-tenant-billing"] })
      ]);
      toast.success(payload.message ?? "Ação de billing executada");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const createInvitationMutation = useMutation({
    mutationFn: async (values: InvitationValues) => {
      if (isPlatformAdmin && !invitePlanId) {
        throw new Error("Selecione o plano inicial do usuario");
      }

      const payload = isPlatformAdmin ? { ...values, role: "admin", planId: invitePlanId } : { ...values, role: "admin" };
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Falha ao criar convite");
      }

      return (await response.json()) as InvitationCreateResponse;
    },
    onSuccess: async (payload) => {
      invitationForm.reset();
      setInvitePlanId("");
      await queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      const absoluteInviteUrl = toAbsoluteInviteUrl(payload.inviteUrl);
      if (payload.emailDelivery?.status === "sent") {
        toast.success("Convite criado e enviado por e-mail", {
          description: `Link do convite: ${absoluteInviteUrl}`
        });
        return;
      }

      if (payload.emailDelivery?.status === "failed" || payload.emailDelivery?.status === "skipped") {
        toast.warning("Convite criado sem envio de e-mail", {
          description: payload.emailDelivery.errorMessage ?? `Link do convite: ${absoluteInviteUrl}`
        });
        return;
      }

      toast.success("Convite criado", {
        description: `Link do convite: ${absoluteInviteUrl}`
      });
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/invitations/${id}`, {
        method: "PATCH"
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Falha ao revogar convite");
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      toast.success("Convite revogado");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  function submitTenantTitheRecalculation(tenant: TenantItem) {
    const monthKey = (tenantTitheDrafts[tenant.id] ?? new Date().toISOString().slice(0, 7)).trim();

    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      toast.error("Use o formato YYYY-MM, por exemplo 2026-05");
      return;
    }

    adminTenantBillingMutation.mutate({
      tenantId: tenant.id,
      action: "recalculate_tithe_month",
      monthKey
    });
  }

  function submitTenantTrialDays(tenant: TenantItem) {
    const parsed = Number((tenantTrialDrafts[tenant.id] ?? String(tenant.trialDays)).trim());

    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Informe uma quantidade de dias maior que zero");
      return;
    }

    updateTenantMutation.mutate({ id: tenant.id, trialDays: parsed });
  }

  function submitTenantExpiryDate(tenant: TenantItem) {
    const rawValue = (tenantExpiryDrafts[tenant.id] ?? (tenant.expiresAt ? formatDateDisplay(tenant.expiresAt) : "")).trim();

    if (!rawValue) {
      updateTenantMutation.mutate({ id: tenant.id, expiresAt: null });
      return;
    }

    const parsedExpiresAt = parseBrazilianDateToDateKey(rawValue);

    if (!parsedExpiresAt) {
      toast.error("Informe a data no formato DD/MM/AAAA");
      return;
    }

    updateTenantMutation.mutate({ id: tenant.id, expiresAt: parsedExpiresAt });
  }

  function submitTenantDeletion(tenant: TenantItem) {
    const confirmation = (tenantDeleteConfirmDrafts[tenant.id] ?? "").trim().toLowerCase();

    if (confirmation !== tenant.slug.trim().toLowerCase()) {
      toast.error("O identificador informado não confere");
      return;
    }

    deleteTenantMutation.mutate(tenant.id);
  }

  function submitUserPasswordReset(user: UserItem) {
    const newPassword = userPasswordDrafts[user.id] ?? "";

    if (newPassword.length < 8) {
      toast.error("A senha precisa ter ao menos 8 caracteres");
      return;
    }

    resetPasswordMutation.mutate({ id: user.id, newPassword });
    setUserPasswordDrafts((current) => ({ ...current, [user.id]: "" }));
  }

  function submitUserDeletion(user: UserItem) {
    const confirmation = (userDeleteConfirmDrafts[user.id] ?? "").trim().toLowerCase();

    if (confirmation !== user.email.trim().toLowerCase()) {
      toast.error("O e-mail informado não confere");
      return;
    }

    deleteUserMutation.mutate(user.id);
  }

  function submitPlanName(plan: PlanItem) {
    const nextName = (planNameDrafts[plan.id] ?? plan.name).trim();

    if (!nextName) {
      toast.error("Informe um nome para o plano");
      return;
    }

    updatePlanMutation.mutate({ id: plan.id, data: { name: nextName } });
  }

  function submitPlanDescription(plan: PlanItem) {
    updatePlanMutation.mutate({
      id: plan.id,
      data: { description: planDescriptionDrafts[plan.id] ?? plan.description ?? "" }
    });
  }

  function submitPlanMaxAccounts(plan: PlanItem) {
    updatePlanMutation.mutate({
      id: plan.id,
      data: { maxAccounts: parseNullableLimit(planMaxAccountsDrafts[plan.id] ?? (plan.maxAccounts?.toString() ?? "")) }
    });
  }

  function submitPlanMaxCards(plan: PlanItem) {
    updatePlanMutation.mutate({
      id: plan.id,
      data: { maxCards: parseNullableLimit(planMaxCardsDrafts[plan.id] ?? (plan.maxCards?.toString() ?? "")) }
    });
  }

  function submitPlanTrialDays(plan: PlanItem) {
    const parsed = Number((planTrialDaysDrafts[plan.id] ?? String(plan.trialDays)).trim());

    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Informe zero ou mais dias de avaliação");
      return;
    }

    updatePlanMutation.mutate({ id: plan.id, data: { trialDays: parsed } });
  }

  return (
    <div className="space-y-6">
      <section className="surface content-section">
        <div className="eyebrow">Administração</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Painel administrativo</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Gerencie contas, colaboradores, convites e limites operacionais do produto.
        </p>
        <div className="info-banner mt-5">
          <strong>Planos são aplicados por conta.</strong> Pessoas convidadas herdam o plano, os limites e os recursos premium da conta à qual passam a ter acesso.
        </div>
        {isPlatformAdmin ? (
          <div className="info-banner mt-5">
            <strong>Superadmin ativo.</strong> A conta principal possui acesso global, recursos Premium e bypass de licença.
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_88%,var(--color-muted))] px-4 py-4">
          <p className="min-w-0 flex-1 break-words text-sm leading-7 text-[var(--color-muted-foreground)]">
            Para compartilhar a mesma carteira com cônjuge ou familiar, use a área dedicada de compartilhamento.
          </p>
          <Button asChild className="w-full sm:w-auto" variant="secondary">
            <Link href="/dashboard/sharing">Abrir convites</Link>
          </Button>
        </div>
      </section>

      <section className="surface content-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Catálogo de planos</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
              Os planos agora são registros reais. Você pode criar, editar, ativar, desativar e excluir planos customizados sem depender de presets fixos.
            </p>
          </div>
          <article className="metric-card w-full sm:w-auto">
            <p className="metric-label">Planos ativos</p>
            <p className="metric-value">{plans.filter((item) => item.isActive).length}</p>
          </article>
        </div>
        {isPlatformAdmin ? (
          <div className="mt-6 rounded-[1.6rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_88%,var(--color-muted))] p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold">Novo plano</h3>
                <p className="mt-1 text-sm leading-7 text-[var(--color-muted-foreground)]">
                  Crie planos personalizados com limites, período de avaliação e recursos premium próprios.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Input onChange={(event) => setNewPlanName(event.target.value)} placeholder="Nome do plano" value={newPlanName} />
              <Input onChange={(event) => setNewPlanSlug(event.target.value)} placeholder="Slug do plano" value={newPlanSlug} />
              <Select onChange={(event) => setNewPlanTier(event.target.value as "free" | "pro")} value={newPlanTier}>
                <option value="free">Gratuito</option>
                <option value="pro">Premium</option>
              </Select>
              <Input
                onChange={(event) => setNewPlanTrialDays(event.target.value)}
                placeholder="Dias de avaliação"
                type="number"
                value={newPlanTrialDays}
              />
              <Input onChange={(event) => setNewPlanMaxAccounts(event.target.value)} placeholder="Limite de contas" value={newPlanMaxAccounts} />
              <Input onChange={(event) => setNewPlanMaxCards(event.target.value)} placeholder="Limite de cartões" value={newPlanMaxCards} />
              <Input
                onChange={(event) => setNewPlanDescription(event.target.value)}
                placeholder="Descrição do plano"
                value={newPlanDescription}
              />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="muted-panel flex items-center gap-3 text-sm">
                <input checked={newPlanWhatsapp} className="app-checkbox" onChange={(event) => setNewPlanWhatsapp(event.target.checked)} type="checkbox" />
                WhatsApp liberado
              </label>
              <label className="muted-panel flex items-center gap-3 text-sm">
                <input checked={newPlanAutomation} className="app-checkbox" onChange={(event) => setNewPlanAutomation(event.target.checked)} type="checkbox" />
                Automações liberadas
              </label>
              <label className="muted-panel flex items-center gap-3 text-sm">
                <input checked={newPlanPdfExport} className="app-checkbox" onChange={(event) => setNewPlanPdfExport(event.target.checked)} type="checkbox" />
                PDF liberado
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 flex-1 break-words text-xs text-[var(--color-muted-foreground)]">
                Limites vazios deixam contas e cartões sem teto específico; pessoas não têm limite por plano.
              </p>
              <Button
                className="w-full sm:w-auto"
                disabled={createPlanMutation.isPending || !newPlanName.trim()}
                onClick={() => createPlanMutation.mutate()}
                type="button"
              >
                {createPlanMutation.isPending ? "Criando plano..." : "Criar plano"}
              </Button>
            </div>
          </div>
        ) : null}
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <article key={plan.id} className="data-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="min-w-0 flex-1 break-words text-lg font-semibold">{plan.name}</h3>
                <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">
                  {plan.isDefault ? "Padrão" : "Customizado"}
                </span>
              </div>
              <p className="mt-3 break-words text-sm leading-7 text-[var(--color-muted-foreground)]">
                {plan.description || "Sem descrição cadastrada para este plano."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--color-muted-foreground)]">
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
                  {formatPlanLabel(plan.tier)}
                </span>
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
                  {plan.trialDays > 0 ? `${plan.trialDays} dias de avaliação` : "Sem avaliação"}
                </span>
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
                  {plan.tenantsCount} conta{plan.tenantsCount === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--color-muted-foreground)]">
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
                  Contas {plan.maxAccounts === null ? "livres" : plan.maxAccounts}
                </span>
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
                  Cartões {plan.maxCards === null ? "livres" : plan.maxCards}
                </span>
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
                  {plan.features.whatsappAssistant ? "WhatsApp" : "Sem WhatsApp"}
                </span>
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
                  {plan.features.automation ? "Automação" : "Sem automação"}
                </span>
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
                  {plan.features.pdfExport ? "PDF" : "Sem PDF"}
                </span>
              </div>
              {isPlatformAdmin ? (
                <div className="mt-4 space-y-3">
                  <div className="grid gap-3 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`plan-${plan.id}-name`}>Nome</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`plan-${plan.id}-name`}
                          value={planNameDrafts[plan.id] ?? plan.name}
                          onChange={(event) =>
                            setPlanNameDrafts((current) => ({
                              ...current,
                              [plan.id]: event.target.value
                            }))
                          }
                        />
                        <Button type="button" variant="secondary" onClick={() => submitPlanName(plan)}>
                          Aplicar
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`plan-${plan.id}-description`}>Descrição</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`plan-${plan.id}-description`}
                          value={planDescriptionDrafts[plan.id] ?? plan.description ?? ""}
                          onChange={(event) =>
                            setPlanDescriptionDrafts((current) => ({
                              ...current,
                              [plan.id]: event.target.value
                            }))
                          }
                        />
                        <Button type="button" variant="ghost" onClick={() => submitPlanDescription(plan)}>
                          Aplicar
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 lg:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor={`plan-${plan.id}-max-accounts`}>Limite de contas</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`plan-${plan.id}-max-accounts`}
                          inputMode="numeric"
                          placeholder="Livre"
                          value={planMaxAccountsDrafts[plan.id] ?? (plan.maxAccounts?.toString() ?? "")}
                          onChange={(event) =>
                            setPlanMaxAccountsDrafts((current) => ({
                              ...current,
                              [plan.id]: event.target.value
                            }))
                          }
                        />
                        <Button type="button" variant="ghost" onClick={() => submitPlanMaxAccounts(plan)}>
                          Aplicar
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`plan-${plan.id}-max-cards`}>Limite de cartões</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`plan-${plan.id}-max-cards`}
                          inputMode="numeric"
                          placeholder="Livre"
                          value={planMaxCardsDrafts[plan.id] ?? (plan.maxCards?.toString() ?? "")}
                          onChange={(event) =>
                            setPlanMaxCardsDrafts((current) => ({
                              ...current,
                              [plan.id]: event.target.value
                            }))
                          }
                        />
                        <Button type="button" variant="ghost" onClick={() => submitPlanMaxCards(plan)}>
                          Aplicar
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`plan-${plan.id}-trial-days`}>Dias de avaliação</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`plan-${plan.id}-trial-days`}
                          inputMode="numeric"
                          value={planTrialDaysDrafts[plan.id] ?? String(plan.trialDays)}
                          onChange={(event) =>
                            setPlanTrialDaysDrafts((current) => ({
                              ...current,
                              [plan.id]: event.target.value
                            }))
                          }
                        />
                        <Button type="button" variant="ghost" onClick={() => submitPlanTrialDays(plan)}>
                          Aplicar
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      updatePlanMutation.mutate({
                        id: plan.id,
                        data: { whatsappAssistant: !plan.features.whatsappAssistant }
                      })
                    }
                    type="button"
                    variant="ghost"
                  >
                    {plan.features.whatsappAssistant ? "Bloquear WhatsApp" : "Liberar WhatsApp"}
                  </Button>
                  <Button
                    onClick={() =>
                      updatePlanMutation.mutate({
                        id: plan.id,
                        data: { automation: !plan.features.automation }
                      })
                    }
                    type="button"
                    variant="ghost"
                  >
                    {plan.features.automation ? "Bloquear automação" : "Liberar automação"}
                  </Button>
                  <Button
                    onClick={() =>
                      updatePlanMutation.mutate({
                        id: plan.id,
                        data: { pdfExport: !plan.features.pdfExport }
                      })
                    }
                    type="button"
                    variant="ghost"
                  >
                    {plan.features.pdfExport ? "Bloquear PDF" : "Liberar PDF"}
                  </Button>
                  {!plan.isDefault ? (
                    <>
                      <Button
                        onClick={() =>
                          updatePlanMutation.mutate({
                            id: plan.id,
                            data: { isActive: !plan.isActive }
                          })
                        }
                        type="button"
                        variant="ghost"
                      >
                        {plan.isActive ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        disabled={deletePlanMutation.isPending || plan.tenantsCount > 0}
                        onClick={() => deletePlanMutation.mutate(plan.id)}
                        type="button"
                        variant="ghost"
                      >
                        Excluir
                      </Button>
                    </>
                  ) : null}
                </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        <article className="metric-card min-w-0"><p className="metric-label">Contas</p><p className="metric-value">{statsQuery.data?.totalTenants ?? 0}</p></article>
        <article className="metric-card min-w-0"><p className="metric-label">Ativos</p><p className="metric-value">{statsQuery.data?.activeTenants ?? 0}</p></article>
        <article className="metric-card min-w-0"><p className="metric-label">Em avaliação</p><p className="metric-value">{statsQuery.data?.trialTenants ?? 0}</p></article>
        <article className="metric-card min-w-0"><p className="metric-label">Expirados</p><p className="metric-value">{statsQuery.data?.expiredTenants ?? 0}</p></article>
        <article className="metric-card min-w-0">
          <p className="metric-label">{isPlatformAdmin ? "Pessoas da plataforma" : "Pessoas da conta"}</p>
          <p className="metric-value">{statsQuery.data?.totalUsers ?? 0}</p>
        </article>
        <article className="metric-card min-w-0">
          <p className="metric-label">{isPlatformAdmin ? "Pessoas ativas da plataforma" : "Pessoas ativas"}</p>
          <p className="metric-value">{statsQuery.data?.activeUsers ?? 0}</p>
        </article>
        {isPlatformAdmin ? (
          <>
            <article className="metric-card min-w-0">
              <p className="metric-label">Pessoas nesta conta</p>
              <p className="metric-value">{statsQuery.data?.currentTenantUsers ?? 0}</p>
            </article>
            <article className="metric-card min-w-0">
              <p className="metric-label">Pessoas ativas nesta conta</p>
              <p className="metric-value">{statsQuery.data?.currentTenantActiveUsers ?? 0}</p>
            </article>
            <article className="metric-card min-w-0">
              <p className="metric-label">Assinaturas ativas</p>
              <p className="metric-value">{statsQuery.data?.billingActiveSubscriptions ?? 0}</p>
            </article>
            <article className="metric-card min-w-0">
              <p className="metric-label">Billing com atenção</p>
              <p className="metric-value">{statsQuery.data?.billingAttentionSubscriptions ?? 0}</p>
            </article>
            <article className="metric-card min-w-0">
              <p className="metric-label">Fila de webhooks</p>
              <p className="metric-value">{statsQuery.data?.billingWebhookQueueDepth ?? 0}</p>
            </article>
            <article className="metric-card min-w-0">
              <p className="metric-label">Falhas críticas</p>
              <p className="metric-value">{statsQuery.data?.billingWebhookFailures ?? 0}</p>
            </article>
          </>
        ) : null}
        <article className="metric-card min-w-0"><p className="metric-label">Transações</p><p className="metric-value">{statsQuery.data?.totalTransactions ?? 0}</p></article>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="surface content-section">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Contas</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                Ajuste plano, avaliação, capacidade e status operacional de cada conta.
              </p>
            </div>
            <article className="metric-card w-full sm:w-auto">
              <p className="metric-label">No recorte</p>
              <p className="metric-value">{tenants.length}</p>
            </article>
          </div>
          {isPlatformAdmin ? (
            <div className="mt-6 rounded-[1.6rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_88%,var(--color-muted))] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-semibold">Nova conta</h3>
                  <p className="mt-1 text-sm leading-7 text-[var(--color-muted-foreground)]">
                    Crie uma nova conta já com plano inicial, identificador limpo e categorias padrão prontas para uso.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Input
                  onChange={(event) => setNewTenantName(event.target.value)}
                  placeholder="Nome da conta"
                  value={newTenantName}
                />
                <Input
                  onChange={(event) => setNewTenantSlug(event.target.value)}
                  placeholder="Identificador da conta"
                  value={newTenantSlug}
                />
                <Select onChange={(event) => setNewTenantPlanId(event.target.value)} value={newTenantPlanId}>
                  <option value="">Escolher plano inicial</option>
                  {plans.filter((item) => item.isActive).map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} • {formatPlanLabel(plan.tier)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="min-w-0 flex-1 break-words text-xs text-[var(--color-muted-foreground)]">
                  O plano é da conta. Depois, basta convidar colaboradores para compartilhar o mesmo espaço financeiro.
                </p>
                <Button
                  className="w-full sm:w-auto"
                  disabled={createTenantMutation.isPending || !newTenantName.trim() || !newTenantPlanId}
                  onClick={() => createTenantMutation.mutate()}
                  type="button"
                >
                  {createTenantMutation.isPending ? "Criando conta..." : "Criar conta"}
                </Button>
              </div>
            </div>
          ) : null}
            <div className="mt-6 space-y-3">
            {isPlatformAdmin ? (
              <div className="warning-panel">
                <p className="warning-copy">
                  O superadmin pode excluir uma conta inteira por card. Essa ação remove pessoas, convites, contas
                  financeiras, cartões, transações e demais dados vinculados.
                </p>
              </div>
            ) : null}
            <div className="filter-shell">
              <p className="filter-kicker">Filtros de contas</p>
              <p className="filter-copy">
                Encontre a conta certa e ajuste plano, ciclo e status com mais clareza.
              </p>
            </div>
            <div className="grid gap-3 xl:grid-cols-4">
              <Input
                onChange={(event) => setTenantSearch(event.target.value)}
                placeholder="Encontre por conta ou identificador"
                value={tenantSearch}
              />
              <Select onChange={(event) => setTenantPlanFilter(event.target.value)} value={tenantPlanFilter}>
                <option value="">Qualquer plano</option>
                <option value="free">Gratuito</option>
                <option value="pro">Premium</option>
              </Select>
              <Select onChange={(event) => setTenantStatusFilter(event.target.value)} value={tenantStatusFilter}>
                <option value="">Qualquer estado</option>
                <option value="active">Ativos</option>
                <option value="trial">Em avaliação</option>
                <option value="expired">Expirados</option>
                <option value="inactive">Inativos</option>
              </Select>
            </div>
            {tenants.map((tenant) => (
              <article key={tenant.id} className="data-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{tenant.name}</p>
                    <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                      Conta {tenant.slug} • Plano {tenant.planName}
                    </p>
                    <p className="break-words text-xs text-[var(--color-muted-foreground)]">
                      {formatLifecycleLabel(tenant)}
                    </p>
                  </div>
                  <div className="w-full shrink-0 sm:min-w-[128px] sm:w-auto sm:text-right">
                    <p className="text-sm font-semibold">{tenant.activeUsers}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">pessoas ativas</p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="muted-panel">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Billing</p>
                    <p className="mt-2 text-sm font-semibold">
                      {formatBillingSubscriptionLabel(tenant.billing.subscriptionStatus)}
                    </p>
                    <div className="mt-3 space-y-1 text-xs text-[var(--color-muted-foreground)]">
                      <p>
                        Próxima cobrança:{" "}
                        {tenant.billing.nextBillingAt ? formatDateTimeDisplay(tenant.billing.nextBillingAt) : "não exposta"}
                      </p>
                      <p>
                        Última sincronização:{" "}
                        {tenant.billing.lastSyncedAt ? formatDateTimeDisplay(tenant.billing.lastSyncedAt) : "nunca"}
                      </p>
                      <p>Fila pendente: {tenant.billing.queueDepth}</p>
                      <p>Falhas de webhook: {tenant.billing.failedWebhooks}</p>
                      <p>
                        Último pagamento: {tenant.billing.latestPaymentStatus ?? "sem pagamento sincronizado"}
                      </p>
                    </div>
                  </div>
                  <div className="muted-panel">
                    <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Suporte</p>
                    <div className="mt-2 space-y-1 text-xs text-[var(--color-muted-foreground)]">
                      <p className="break-all">Preapproval: {tenant.billing.preapprovalId ?? "não vinculado"}</p>
                      <p>
                        Cancelamento agendado: {tenant.billing.cancelRequestedAt ? formatDateTimeDisplay(tenant.billing.cancelRequestedAt) : "não"}
                      </p>
                      <p>
                        Último reparo financeiro:{" "}
                        {tenant.billing.lastFinancialRepair
                          ? formatDateTimeDisplay(tenant.billing.lastFinancialRepair.createdAt)
                          : "nenhum reparo registrado"}
                      </p>
                      {tenant.billing.lastFinancialRepair ? (
                        <p className="leading-5">{tenant.billing.lastFinancialRepair.summary}</p>
                      ) : null}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        onClick={() =>
                          setExpandedTenantBillingId((current) => (current === tenant.id ? null : tenant.id))
                        }
                        type="button"
                        variant="secondary"
                      >
                        {expandedTenantBillingId === tenant.id ? "Ocultar detalhes" : "Ver detalhes financeiros"}
                      </Button>
                    </div>
                  </div>
                </div>
                {expandedTenantBillingId === tenant.id ? (
                  <div className="mt-4 rounded-[1.4rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_92%,var(--color-muted))] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                          Drill-down financeiro
                        </p>
                        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
                          Use este painel para suporte operacional, reconciliação de cobrança e leitura rápida dos últimos eventos.
                        </p>
                      </div>
                    </div>
                    {tenantBillingDetailsQuery.isLoading ? (
                      <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">Carregando detalhes financeiros...</p>
                    ) : tenantBillingDetailsQuery.isError ? (
                      <p className="mt-4 text-sm text-[var(--color-destructive)]">
                        Não foi possível carregar os detalhes financeiros desta conta.
                      </p>
                    ) : tenantBillingDetailsQuery.data ? (
                      <div className="mt-4 space-y-4">
                        <div className="grid gap-3 lg:grid-cols-3">
                          <div className="muted-panel">
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Assinatura</p>
                            <div className="mt-2 space-y-1 text-xs text-[var(--color-muted-foreground)]">
                              <p>Status: {formatBillingSubscriptionLabel(tenantBillingDetailsQuery.data.subscription?.status ?? null)}</p>
                              <p className="break-all">Preapproval: {tenantBillingDetailsQuery.data.subscription?.mercadoPagoPreapprovalId ?? "não vinculado"}</p>
                              <p className="break-all">Pagador: {tenantBillingDetailsQuery.data.subscription?.payerEmail || "não informado"}</p>
                              <p>
                                Próxima cobrança:{" "}
                                {tenantBillingDetailsQuery.data.subscription?.nextBillingAt
                                  ? formatDateTimeDisplay(tenantBillingDetailsQuery.data.subscription.nextBillingAt)
                                  : "não exposta"}
                              </p>
                            </div>
                          </div>
                          <div className="muted-panel">
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Pagamentos recentes</p>
                            <div className="mt-2 space-y-2 text-xs text-[var(--color-muted-foreground)]">
                              {tenantBillingDetailsQuery.data.subscription?.payments.length ? (
                                tenantBillingDetailsQuery.data.subscription.payments.map((payment) => (
                                  <div key={payment.id} className="rounded-2xl border border-[var(--color-border)] px-3 py-2">
                                    <p className="break-all font-medium text-[var(--color-foreground)]">
                                      {payment.providerPaymentId}
                                    </p>
                                    <p>
                                      {payment.status} • R$ {payment.amount.toFixed(2)}
                                    </p>
                                    <p>{payment.createdAt ? formatDateTimeDisplay(payment.createdAt) : "sem data"}</p>
                                  </div>
                                ))
                              ) : (
                                <p>Nenhum pagamento sincronizado.</p>
                              )}
                            </div>
                          </div>
                          <div className="muted-panel">
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Webhooks recentes</p>
                            <div className="mt-2 space-y-2 text-xs text-[var(--color-muted-foreground)]">
                              {tenantBillingDetailsQuery.data.webhookEvents.length ? (
                                tenantBillingDetailsQuery.data.webhookEvents.slice(0, 5).map((event) => (
                                  <div key={event.id} className="rounded-2xl border border-[var(--color-border)] px-3 py-2">
                                    <p className="font-medium text-[var(--color-foreground)]">{event.topic}</p>
                                    <p>{event.status} • tentativas {event.attempts}</p>
                                    <p>{formatDateTimeDisplay(event.createdAt)}</p>
                                    {event.error ? <p className="line-clamp-2 text-[var(--color-destructive)]">{event.error}</p> : null}
                                  </div>
                                ))
                              ) : (
                                <p>Nenhum webhook recente.</p>
                              )}
                            </div>
                          </div>
                        </div>
                        {isPlatformAdmin ? (
                          <div className="rounded-[1.2rem] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                              Operações financeiras
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                disabled={!tenant.billing.preapprovalId || adminTenantBillingMutation.isPending}
                                onClick={() =>
                                  adminTenantBillingMutation.mutate({
                                    tenantId: tenant.id,
                                    action: "sync_subscription"
                                  })
                                }
                                type="button"
                                variant="secondary"
                              >
                                Sincronizar billing
                              </Button>
                              <Button
                                disabled={!tenant.billing.preapprovalId || adminTenantBillingMutation.isPending}
                                onClick={() =>
                                  adminTenantBillingMutation.mutate({
                                    tenantId: tenant.id,
                                    action: "process_queue"
                                  })
                                }
                                type="button"
                                variant="ghost"
                              >
                                Reprocessar fila
                              </Button>
                              <Button
                                disabled={adminTenantBillingMutation.isPending}
                                onClick={() => submitTenantTitheRecalculation(tenant)}
                                type="button"
                                variant="ghost"
                              >
                                Recalcular dízimo
                              </Button>
                              <Button
                                disabled={adminTenantBillingMutation.isPending}
                                onClick={() =>
                                  adminTenantBillingMutation.mutate({
                                    tenantId: tenant.id,
                                    action: "sync_due_subscriptions"
                                  })
                                }
                                type="button"
                                variant="ghost"
                              >
                                Sincronizar recorrências
                              </Button>
                              <Button
                                disabled={adminTenantBillingMutation.isPending}
                                onClick={() =>
                                  adminTenantBillingMutation.mutate({
                                    tenantId: tenant.id,
                                    action: "reconcile_due_installments"
                                  })
                                }
                                type="button"
                                variant="ghost"
                              >
                                Conciliar parcelas vencidas
                              </Button>
                            </div>
                            <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,180px)_auto]">
                              <div className="space-y-2">
                                <Label htmlFor={`tenant-${tenant.id}-tithe-month`}>Competência do reparo</Label>
                                <Input
                                  id={`tenant-${tenant.id}-tithe-month`}
                                  placeholder="2026-05"
                                  value={tenantTitheDrafts[tenant.id] ?? new Date().toISOString().slice(0, 7)}
                                  onChange={(event) =>
                                    setTenantTitheDrafts((current) => ({
                                      ...current,
                                      [tenant.id]: event.target.value
                                    }))
                                  }
                                />
                              </div>
                              <Button
                                className="lg:self-end"
                                disabled={adminTenantBillingMutation.isPending}
                                onClick={() => submitTenantTitheRecalculation(tenant)}
                                type="button"
                                variant="secondary"
                              >
                                Aplicar reparo
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Select
                    onChange={(event) =>
                      setTenantPlanDrafts((current) => ({
                        ...current,
                        [tenant.id]: event.target.value
                      }))
                    }
                    value={tenantPlanDrafts[tenant.id] ?? tenant.planId}
                  >
                    {plans.filter((item) => item.isActive).map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} • {formatPlanLabel(plan.tier)}
                      </option>
                    ))}
                  </Select>
                  <Button
                    disabled={(tenantPlanDrafts[tenant.id] ?? tenant.planId) === tenant.planId}
                    onClick={() =>
                      updateTenantMutation.mutate({
                        id: tenant.id,
                        planId: tenantPlanDrafts[tenant.id] ?? tenant.planId
                      })
                    }
                    type="button"
                    variant="secondary"
                  >
                    Aplicar plano
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="min-w-[12rem] flex-1 space-y-2">
                    <Label htmlFor={`tenant-${tenant.id}-trial-days`}>Dias de avaliação</Label>
                    <Input
                      id={`tenant-${tenant.id}-trial-days`}
                      inputMode="numeric"
                      value={tenantTrialDrafts[tenant.id] ?? String(tenant.trialDays)}
                      onChange={(event) =>
                        setTenantTrialDrafts((current) => ({
                          ...current,
                          [tenant.id]: event.target.value
                        }))
                      }
                    />
                  </div>
                  <Button
                    className="self-end"
                    onClick={() => submitTenantTrialDays(tenant)}
                    type="button"
                    variant="ghost"
                  >
                    Avaliação
                  </Button>
                  <div className="min-w-[14rem] flex-1 space-y-2">
                    <Label htmlFor={`tenant-${tenant.id}-expires-at`}>Expiração</Label>
                    <Input
                      id={`tenant-${tenant.id}-expires-at`}
                      placeholder="DD/MM/AAAA"
                      value={tenantExpiryDrafts[tenant.id] ?? (tenant.expiresAt ? formatDateDisplay(tenant.expiresAt) : "")}
                      onChange={(event) =>
                        setTenantExpiryDrafts((current) => ({
                          ...current,
                          [tenant.id]: event.target.value
                        }))
                      }
                    />
                  </div>
                  <Button
                    className="self-end"
                    onClick={() => submitTenantExpiryDate(tenant)}
                    type="button"
                    variant="ghost"
                  >
                    Expiração
                  </Button>
                  <Button
                    onClick={() => updateTenantMutation.mutate({ id: tenant.id, isActive: !tenant.isActive })}
                    type="button"
                    variant="ghost"
                  >
                    {tenant.isActive ? "Desativar" : "Ativar"}
                  </Button>
                </div>
                {isPlatformAdmin ? (
                  <div className="danger-panel mt-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="danger-kicker">Ação crítica</p>
                        <p className="danger-copy">
                          Exclui a conta <strong>{tenant.slug}</strong> com pessoas, convites, cartões, contas
                          financeiras, transações e demais registros relacionados.
                        </p>
                      </div>
                      <div className="w-full space-y-2 lg:w-auto">
                        <Label htmlFor={`tenant-${tenant.id}-delete-confirm`}>Confirme digitando o slug</Label>
                        <div className="flex flex-col gap-2 lg:flex-row">
                          <Input
                            id={`tenant-${tenant.id}-delete-confirm`}
                            placeholder={tenant.slug}
                            value={tenantDeleteConfirmDrafts[tenant.id] ?? ""}
                            onChange={(event) =>
                              setTenantDeleteConfirmDrafts((current) => ({
                                ...current,
                                [tenant.id]: event.target.value
                              }))
                            }
                          />
                          <Button
                            className="w-full border-[var(--color-destructive)] bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)] lg:w-auto"
                            disabled={deleteTenantMutation.isPending}
                            onClick={() => submitTenantDeletion(tenant)}
                            type="button"
                            variant="ghost"
                          >
                            Excluir conta e dados
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className="surface content-section">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Colaboradores</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                Controle perfis, acesso e redefinição de senha das pessoas com acesso à conta.
              </p>
            </div>
            <article className="metric-card w-full sm:w-auto">
              <p className="metric-label">No recorte</p>
              <p className="metric-value">{users.length}</p>
            </article>
          </div>
          <div className="mt-6 space-y-3">
            {isPlatformAdmin ? (
              <div className="warning-panel">
                <p className="warning-copy">
                  A exclusão definitiva de pessoa fica disponível em cada card e apaga também os dados financeiros
                  vinculados a ela, respeitando os bloqueios de segurança da conta principal.
                </p>
              </div>
            ) : null}
            <div className="filter-shell">
              <p className="filter-kicker">Filtros de colaboradores</p>
              <p className="filter-copy">
                Selecione conta, perfil, status e atividade para localizar cada pessoa com mais rapidez.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                onChange={(event) => {
                  setUserSearch(event.target.value);
                  setUserPage(1);
                }}
                placeholder="Encontre por nome, e-mail ou conta"
                value={userSearch}
              />
              {isPlatformAdmin ? (
                <Select
                  onChange={(event) => {
                    setUserTenantFilter(event.target.value);
                    setUserPage(1);
                  }}
                  value={userTenantFilter}
                >
                  <option value="">Qualquer conta</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <div />
              )}
              <Select
                onChange={(event) => {
                  setUserRoleFilter(event.target.value);
                  setUserPage(1);
                }}
                value={userRoleFilter}
              >
                <option value="">Qualquer perfil</option>
                <option value="admin">{formatRoleFilterLabel("admin")}</option>
                <option value="member">{formatRoleFilterLabel("member")}</option>
              </Select>
              <Select
                onChange={(event) => {
                  setUserStatusFilter(event.target.value);
                  setUserPage(1);
                }}
                value={userStatusFilter}
              >
                <option value="">Qualquer status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </Select>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              <Select
                onChange={(event) => {
                  setUserLastLoginFilter(event.target.value);
                  setUserPage(1);
                }}
                value={userLastLoginFilter}
              >
                <option value="">Qualquer atividade</option>
                <option value="recent">Login nos últimos 30 dias</option>
                <option value="never">Nunca acessaram</option>
              </Select>
              <Select
                onChange={(event) => {
                  setUserSort(event.target.value);
                  setUserPage(1);
                }}
                value={userSort}
              >
                <option value="created_desc">Entrada mais recente</option>
                <option value="created_asc">Entrada mais antiga</option>
                <option value="login_desc">Último login mais recente</option>
                <option value="name_asc">Nome A-Z</option>
              </Select>
              <div className="flex items-center text-sm text-[var(--color-muted-foreground)] xl:justify-end">
                {usersMeta ? `${usersMeta.total} pessoas no recorte atual` : "Atualizando recorte..."}
              </div>
            </div>
            <div className="space-y-3">
                {users.map((user) => (
                  <article key={user.id} className="data-card p-4">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,auto)] xl:items-start">
                      <div className="min-w-0 space-y-1">
                        <p className="break-words font-semibold">{user.name}</p>
                        <p className="break-all text-sm leading-6 text-[var(--color-muted-foreground)]">
                          {user.email} • {user.tenant.name}
                          {user.isPlatformAdmin ? " • Superadmin" : ""}
                        </p>
                        <p className="break-words text-xs leading-5 text-[var(--color-muted-foreground)]">
                          Perfil:{" "}
                          {formatRoleLabel({
                            role: user.role,
                            isPlatformAdmin: user.isPlatformAdmin,
                            accountAdminName: user.tenant.accountAdminName
                          })}
                        </p>
                        {user.role === "member" ? (
                          <p className="break-words text-xs leading-5 text-[var(--color-muted-foreground)]">
                            Vinculado a:{" "}
                            {user.tenant.accountAdminName ? (
                              <>
                                <strong>{user.tenant.accountAdminName}</strong>
                                {user.tenant.accountAdminEmail ? ` • ${user.tenant.accountAdminEmail}` : ""}
                              </>
                            ) : (
                              "Titular da conta não identificado"
                            )}
                          </p>
                        ) : null}
                        <p className="break-words text-xs leading-5 text-[var(--color-muted-foreground)]">
                          Conta {user.tenant.slug} • {formatUserTenantPlanLabel(user)}
                        </p>
                        <p className="break-words text-xs leading-5 text-[var(--color-muted-foreground)]">
                          Último login: {user.lastLogin ? formatDateTimeDisplay(user.lastLogin) : "Nunca acessou"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        {isPlatformAdmin ? (
                          <Button
                            onClick={() => toggleRoleMutation.mutate({ id: user.id, role: user.role === "admin" ? "member" : "admin" })}
                            type="button"
                            variant="secondary"
                          >
                            Tornar {user.role === "admin" ? "familiar" : "admin de conta"}
                          </Button>
                        ) : null}
                        <div className="min-w-[14rem] flex-1 space-y-2 xl:max-w-xs">
                          <Label htmlFor={`user-${user.id}-password`}>Nova senha</Label>
                          <Input
                            id={`user-${user.id}-password`}
                            placeholder="Ao menos 8 caracteres"
                            type="password"
                            value={userPasswordDrafts[user.id] ?? ""}
                            onChange={(event) =>
                              setUserPasswordDrafts((current) => ({
                                ...current,
                                [user.id]: event.target.value
                              }))
                            }
                          />
                        </div>
                        <Button
                          className="self-end"
                          onClick={() => submitUserPasswordReset(user)}
                          type="button"
                          variant="secondary"
                        >
                          Resetar senha
                        </Button>
                        <Button
                          onClick={() => toggleActiveMutation.mutate({ id: user.id, isActive: !user.isActive })}
                          type="button"
                          variant="ghost"
                        >
                          {user.isActive ? "Desativar" : "Ativar"}
                        </Button>
                      </div>
                    </div>
                    {isPlatformAdmin && !user.isPlatformAdmin ? (
                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                        <Select
                          onChange={(event) =>
                            setUserTenantDrafts((current) => ({
                              ...current,
                              [user.id]: event.target.value
                            }))
                          }
                          value={userTenantDrafts[user.id] ?? user.tenant.id}
                        >
                          {tenants.map((tenant) => (
                            <option key={tenant.id} value={tenant.id}>
                              {getTenantLabel(tenant)}
                            </option>
                          ))}
                        </Select>
                        <Button
                          disabled={(userTenantDrafts[user.id] ?? user.tenant.id) === user.tenant.id || moveUserTenantMutation.isPending}
                          onClick={() =>
                            moveUserTenantMutation.mutate({
                              id: user.id,
                              tenantId: userTenantDrafts[user.id] ?? user.tenant.id
                            })
                          }
                          type="button"
                          variant="ghost"
                        >
                          Alterar conta
                        </Button>
                      </div>
                    ) : null}
                    {!user.isPlatformAdmin ? (
                      <div className="danger-panel mt-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <p className="danger-kicker">Ação crítica</p>
                            <p className="danger-copy">
                              Remove <strong>{user.name}</strong> e os dados financeiros vinculados ao perfil. A ação
                              respeita as travas de segurança para não desmontar a administração principal da conta.
                            </p>
                          </div>
                          <div className="w-full space-y-2 lg:w-auto">
                            <Label htmlFor={`user-${user.id}-delete-confirm`}>Confirme digitando o e-mail</Label>
                            <div className="flex flex-col gap-2 lg:flex-row">
                              <Input
                                id={`user-${user.id}-delete-confirm`}
                                placeholder={user.email}
                                value={userDeleteConfirmDrafts[user.id] ?? ""}
                                onChange={(event) =>
                                  setUserDeleteConfirmDrafts((current) => ({
                                    ...current,
                                    [user.id]: event.target.value
                                  }))
                                }
                              />
                              <Button
                                className="w-full border-[var(--color-destructive)] bg-[color-mix(in_srgb,var(--color-destructive)_8%,transparent)] text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_14%,transparent)] lg:w-auto"
                                disabled={deleteUserMutation.isPending}
                                onClick={() => submitUserDeletion(user)}
                                type="button"
                                variant="ghost"
                              >
                                Excluir pessoa e dados
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </article>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <p className="text-sm text-[var(--color-muted-foreground)]">
                    Página {usersMeta?.page ?? 1} de {usersMeta?.totalPages ?? 1}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      disabled={!usersMeta || usersMeta.page <= 1}
                      onClick={() => setUserPage((current) => Math.max(1, current - 1))}
                      type="button"
                      variant="ghost"
                    >
                      Anterior
                    </Button>
                    <Button
                      disabled={!usersMeta || usersMeta.page >= usersMeta.totalPages}
                      onClick={() => setUserPage((current) => current + 1)}
                      type="button"
                      variant="ghost"
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
            </div>
          </div>
        </section>
      </div>

      {isPlatformAdmin ? (
        <div className="grid gap-6 2xl:grid-cols-[0.9fr_1.1fr]">
          <section className="surface content-section">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Convidar novo Admin de Conta</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Convites criados aqui sempre abrem uma conta nova e vazia para um novo <strong>Admin de Conta</strong>.
            </p>
            <form
              className="mt-6 space-y-4"
              onSubmit={invitationForm.handleSubmit(
                (values) => createInvitationMutation.mutate(values),
                (errors) => {
                  const firstError = errors.name?.message || errors.email?.message || errors.role?.message;
                  toast.error(firstError ?? "Revise os dados do convite");
                }
              )}
            >
              <div className="space-y-2">
                <Label htmlFor="invite-plan">Plano inicial</Label>
                <Select id="invite-plan" onChange={(event) => setInvitePlanId(event.target.value)} value={invitePlanId}>
                  <option value="">Selecione o plano inicial</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </Select>
                {(() => {
                  const selectedPlan = plans.find((plan) => plan.id === invitePlanId);

                  if (!selectedPlan) {
                    return (
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        Selecione explicitamente se o usuário entrará no plano gratuito, premium ou outro plano ativo.
                      </p>
                    );
                  }

                  return (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      A pessoa convidada entrará em uma nova conta com o plano <strong>{selectedPlan.name}</strong> como{" "}
                      <strong>Admin de Conta</strong>.
                    </p>
                  );
                })()}
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-user-name">Nome</Label>
                <Input id="invite-user-name" {...invitationForm.register("name")} />
                {invitationForm.formState.errors.name ? (
                  <p className="text-sm text-[var(--color-destructive)]">
                    {invitationForm.formState.errors.name.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-user-email">E-mail</Label>
                <Input id="invite-user-email" type="email" {...invitationForm.register("email")} />
                {invitationForm.formState.errors.email ? (
                  <p className="text-sm text-[var(--color-destructive)]">
                    {invitationForm.formState.errors.email.message}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <input type="hidden" value="admin" {...invitationForm.register("role")} />
                <Label htmlFor="invite-user-role">Perfil</Label>
                <div
                  className="flex min-h-10 items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-panel)] px-3 text-sm text-[var(--color-foreground)]"
                  id="invite-user-role"
                >
                  Admin de Conta
                </div>
                {invitationForm.formState.errors.role ? (
                  <p className="text-sm text-[var(--color-destructive)]">
                    {invitationForm.formState.errors.role.message}
                  </p>
                ) : null}
              </div>
              <Button className="w-full" disabled={createInvitationMutation.isPending} type="submit">
                {createInvitationMutation.isPending ? "Criando convite..." : "Gerar convite"}
              </Button>
            </form>
          </section>

          <section className="surface content-section">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-semibold tracking-[-0.03em]">Convites ativos e histórico</h2>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                  Acompanhe convites pendentes, aceitos e revogados sem perder o link de acesso.
                </p>
              </div>
              <article className="metric-card w-full sm:w-auto">
                <p className="metric-label">No recorte</p>
                <p className="metric-value">{invitations.length}</p>
              </article>
            </div>
            <div className="mt-6 space-y-3">
              <div className="filter-shell">
                <p className="filter-kicker">Recorte de convite</p>
                <p className="filter-copy">
                  Localize convites ativos, aceitos ou revogados sem perder o contexto da conta de origem.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  onChange={(event) => setInvitationSearch(event.target.value)}
                  placeholder="Encontre convites por nome ou e-mail"
                  value={invitationSearch}
                />
                <Select onChange={(event) => setInvitationTenantFilter(event.target.value)} value={invitationTenantFilter}>
                  <option value="">Qualquer conta</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </Select>
              </div>
              {invitations.map((invitation) => (
                <article key={invitation.id} className="data-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold">{invitation.name}</p>
                      <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                        {invitation.email} • {formatRoleLabel({ role: invitation.role })}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                        <a
                          className="font-medium text-[var(--color-primary)]"
                          href={toAbsoluteInviteUrl(invitation.inviteUrl)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Abrir link do convite
                        </a>
                        <button
                          className="font-medium text-[var(--color-primary)]"
                          onClick={async () => {
                            await navigator.clipboard.writeText(toAbsoluteInviteUrl(invitation.inviteUrl));
                            toast.success("Link copiado");
                          }}
                          type="button"
                        >
                          Copiar link
                        </button>
                      </div>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        Status: {invitation.acceptedAt ? "aceito" : invitation.revokedAt ? "revogado" : "pendente"}
                      </p>
                    </div>
                    {!invitation.acceptedAt && !invitation.revokedAt ? (
                      <Button
                        className="w-full sm:w-auto"
                        disabled={revokeInvitationMutation.isPending}
                        onClick={() => revokeInvitationMutation.mutate(invitation.id)}
                        type="button"
                        variant="ghost"
                      >
                        Revogar
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <section className="surface content-section">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Convites familiares</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
                Como <strong>Admin de Conta</strong>, seus convites sempre saem pelo módulo de compartilhamento e entram
                com o perfil <strong>Familiar</strong>, respeitando as limitações da carteira compartilhada.
              </p>
            </div>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/dashboard/sharing">Abrir compartilhamento</Link>
            </Button>
          </div>
        </section>
      )}

      <section className="surface content-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Auditoria administrativa</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Acompanhe alterações sensíveis em pessoas, convites, contas e planos.
            </p>
          </div>
          <article className="metric-card w-full sm:w-auto">
            <p className="metric-label">No recorte</p>
            <p className="metric-value">{auditItems.length}</p>
          </article>
        </div>
        <div className="mt-6 space-y-3">
          <div className="filter-shell">
            <p className="filter-kicker">Recorte de auditoria</p>
            <p className="filter-copy">
              Filtre eventos por conta ou ação para ler decisões sensíveis com mais contexto e menos ruído.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              onChange={(event) => setAuditSearch(event.target.value)}
              placeholder="Encontre eventos, pessoas ou contas"
              value={auditSearch}
            />
            {isPlatformAdmin ? (
              <Select onChange={(event) => setAuditTenantFilter(event.target.value)} value={auditTenantFilter}>
                <option value="">Qualquer conta</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </Select>
            ) : (
              <div />
            )}
            <Select onChange={(event) => setAuditActionFilter(event.target.value)} value={auditActionFilter}>
              <option value="">Qualquer ação</option>
              <option value="user.updated">Pessoas atualizadas</option>
              <option value="user.deleted">Pessoas excluídas</option>
              <option value="tenant.updated">Contas atualizadas</option>
              <option value="tenant.deleted">Contas excluídas</option>
              <option value="plan.created">Planos criados</option>
              <option value="plan.updated">Planos atualizados</option>
              <option value="plan.deleted">Planos excluídos</option>
              <option value="invitation.created">Convites criados</option>
              <option value="invitation.revoked">Convites revogados</option>
              <option value="billing.subscription.synced">Billing sincronizado</option>
              <option value="billing.queue.reprocessed">Fila de billing reprocessada</option>
              <option value="finance.tithe.recalculated">Dízimo recalculado</option>
              <option value="finance.subscriptions.synced">Recorrências sincronizadas</option>
              <option value="finance.installments.reconciled">Parcelas conciliadas</option>
            </Select>
          </div>
          {auditItems.map((item) => (
            <article key={item.id} className="data-card p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{item.summary}</p>
                  <p className="text-sm text-[var(--color-muted-foreground)] break-all">
                    {item.actorUser.name} • {item.actorUser.email}
                    {item.targetTenant ? ` • ${item.targetTenant.name}` : ""}
                    {item.targetUser ? ` • ${item.targetUser.email}` : ""}
                  </p>
                </div>
                <div className="whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
                  {formatDateTimeDisplay(item.createdAt)}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
