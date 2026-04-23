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
import { AdminInvitationCard } from "@/features/admin/components/admin-invitation-card";
import { AdminPlanCard } from "@/features/admin/components/admin-plan-card";
import {
  type InvitationItem,
  type PlanItem,
  type TenantItem,
  type UserItem,
  formatBillingSubscriptionLabel,
  formatPlanLabel
} from "@/features/admin/components/admin-shared";
import { AdminTenantCard } from "@/features/admin/components/admin-tenant-card";
import { AdminUserCard } from "@/features/admin/components/admin-user-card";
import { PopupCampaignManager } from "@/features/admin/components/popup-campaign-manager";
import { invitationSchema, type InvitationValues } from "@/features/password/schemas/password-schema";
import { formatDateDisplay, formatDateTimeDisplay, parseBrazilianDateToDateKey } from "@/lib/date";
import { formatRoleFilterLabel } from "@/lib/users/role-label";

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
  internalActiveSubscriptions: number;
  billingWebhookQueueDepth: number;
  billingWebhookFailures: number;
  retention: {
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
    policy: {
      enabled: boolean;
      firstWarningDays: number;
      secondWarningDays: number;
      closureDays: number;
      enabledAt: string | null;
      graceUntil: string | null;
    };
  } | null;
  currentTenantUsers: number;
  currentTenantActiveUsers: number;
};

type RetentionRunResponse = {
  message: string;
  result: {
    dryRun: boolean;
    scannedTenants: number;
    warningsPlanned: number;
    warningsSent: number;
    skippedWarnings: number;
    inactiveAccountsWarned: number;
    inactiveAccountsClosed: number;
    trialAccountsWarned: number;
    trialAccountsClosed: number;
  };
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

type UserListResponse = {
  items: UserItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type InvitationCreateResponse = {
  inviteUrl: string;
  reused?: boolean;
  message?: string;
  emailDelivery?: {
    status: "pending" | "sent" | "failed" | "skipped";
    errorMessage: string | null;
    attemptedAt: string | null;
  };
};

type InvitationResendResponse = {
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

async function runRetention(dryRun: boolean) {
  const response = await fetch("/api/admin/retention", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dryRun,
      confirm: dryRun ? undefined : "ENCERRAR-CONTAS"
    })
  });
  const payload = (await response.json().catch(() => ({}))) as Partial<RetentionRunResponse> & { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? "Falha ao executar retenção");
  }

  return payload as RetentionRunResponse;
}

async function updateRetentionPolicy(input: { enabled: boolean; closureDays: number }) {
  const response = await fetch("/api/admin/retention", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const payload = (await response.json().catch(() => ({}))) as { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? "Falha ao atualizar retenção");
  }

  return payload;
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

async function getAudit(filters: { search?: string; tenantId?: string; action?: string; limit?: string }) {
  const response = await fetch(`/api/admin/audit${buildQuery(filters)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar auditoria");
  return (await response.json()) as { items: AuditItem[]; limit: number };
}

export function AdminClient({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
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
  const [auditLimit, setAuditLimit] = useState("30");
  const [retentionEnabledDraft, setRetentionEnabledDraft] = useState<boolean | null>(null);
  const [retentionClosureDaysDraft, setRetentionClosureDaysDraft] = useState<string | null>(null);
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
  const tenants = tenantsQuery.data?.items ?? [];
  const activeTenantBillingId = expandedTenantBillingId ?? (isPlatformAdmin ? tenants[0]?.id : null);
  const tenantBillingDetailsQuery = useQuery({
    queryKey: ["admin-tenant-billing", activeTenantBillingId],
    queryFn: () => getTenantBillingDetails(activeTenantBillingId!),
    enabled: Boolean(activeTenantBillingId)
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
    queryKey: ["admin-audit", auditSearch, auditTenantFilter, auditActionFilter, auditLimit],
    queryFn: () =>
      getAudit({
        search: auditSearch || undefined,
        tenantId: auditTenantFilter || undefined,
        action: auditActionFilter || undefined,
        limit: auditLimit
      })
  });
  const plans = plansQuery.data?.items ?? [];
  const users = usersQuery.data?.items ?? [];
  const usersMeta = usersQuery.data;
  const invitations = invitationsQuery.data?.items ?? [];
  const auditItems = auditQuery.data?.items ?? [];

  function getTenantLabel(tenant: TenantItem) {
    return `${tenant.name} • ${tenant.planName}`;
  }

  const setPasswordMutation = useMutation({
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
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const sendPasswordResetMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const response = await fetch(`/api/admin/users/${id}/password-reset`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) throw new Error(payload.message ?? "Falha ao iniciar redefinição de senha");
      return payload;
    },
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      toast.success(payload.message ?? "Link de redefinição enviado");
    },
    onError: (error) => {
      toast.error(error.message);
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

  const retentionPolicyMutation = useMutation({
    mutationFn: async () =>
      updateRetentionPolicy({
        enabled: retentionEnabledDraft ?? statsQuery.data?.retention?.policy.enabled ?? true,
        closureDays: Number(retentionClosureDaysDraft ?? statsQuery.data?.retention?.policy.closureDays ?? 90)
      }),
    onSuccess: async (payload) => {
      setRetentionEnabledDraft(null);
      setRetentionClosureDaysDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success(payload.message ?? "Política de retenção atualizada");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const retentionRunMutation = useMutation({
    mutationFn: runRetention,
    onSuccess: async (payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] })
      ]);
      toast.success(payload.message);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-invitations"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      const absoluteInviteUrl = toAbsoluteInviteUrl(payload.inviteUrl);
      if (payload.reused) {
        toast.warning("Ja existia um convite ativo para este e-mail", {
          description: `Link atual: ${absoluteInviteUrl}`
        });
        return;
      }

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

  const resendInvitationMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/invitations/${id}`, {
        method: "POST"
      });

      const payload = (await response.json().catch(() => ({}))) as InvitationResendResponse & { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao reenviar convite");
      }

      return payload;
    },
    onSuccess: async (payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-invitations"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);

      const absoluteInviteUrl = toAbsoluteInviteUrl(payload.inviteUrl);
      if (payload.emailDelivery?.status === "sent") {
        toast.success("Convite reenviado por e-mail", {
          description: `Link atual: ${absoluteInviteUrl}`
        });
        return;
      }

      toast.warning("Convite reenviado sem confirmação de entrega", {
        description: payload.emailDelivery?.errorMessage ?? `Link atual: ${absoluteInviteUrl}`
      });
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
    if (isPlatformAdmin) {
      sendPasswordResetMutation.mutate({ id: user.id });
      return;
    }

    const newPassword = userPasswordDrafts[user.id] ?? "";

    if (newPassword.length < 8) {
      toast.error("A senha precisa ter ao menos 8 caracteres");
      return;
    }

    setPasswordMutation.mutate({ id: user.id, newPassword });
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

  const adminIntroCopy = isPlatformAdmin
    ? "Central de operação da plataforma para suporte, cobrança, contas e governança."
    : "Gerencie contas, colaboradores, convites e limites operacionais do produto.";
  const adminIntroBanner = isPlatformAdmin
    ? "Superadmin ativo. Esta visão foi reduzida para operação da plataforma, sem misturar rotina financeira de usuário final."
    : "Planos são aplicados por conta. Pessoas convidadas herdam o plano, os limites e os recursos premium da conta à qual passam a ter acesso.";
  const plansLayoutClassName = isPlatformAdmin ? "mt-6 grid gap-4 2xl:grid-cols-2" : "mt-6 grid gap-4 xl:grid-cols-2";
  const statsLayoutClassName = isPlatformAdmin ? "metric-grid" : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";
  const adminSectionsLayoutClassName = isPlatformAdmin ? "grid gap-6" : "grid gap-6 xl:grid-cols-[1fr_1fr]";

  return (
    <div className="admin-shell">
      <section className="surface-strong content-section admin-hero-section">
        <div className="admin-hero-grid">
          <div className="section-stack">
            <div className="eyebrow">Administração</div>
            <div className="page-intro">
              <h1 className="page-title">Painel administrativo</h1>
              <p className="page-copy">{adminIntroCopy}</p>
            </div>
            <div className="info-banner">
              <strong>{isPlatformAdmin ? "Modo operação." : "Planos por conta."}</strong> {adminIntroBanner}
            </div>
          </div>
        {isPlatformAdmin ? (
          <div className="admin-hero-rail">
            <article className="metric-card">
              <p className="metric-label">Contas ativas</p>
              <p className="metric-value">{statsQuery.data?.activeTenants ?? 0}</p>
              <p className="metric-footnote">Operação estável nas contas ativas.</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Billing alerta</p>
              <p className="metric-value">{statsQuery.data?.billingAttentionSubscriptions ?? 0}</p>
              <p className="metric-footnote">Assinaturas que pedem atenção.</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Fila webhook</p>
              <p className="metric-value">{statsQuery.data?.billingWebhookQueueDepth ?? 0}</p>
              <p className="metric-footnote">Eventos pendentes na fila de billing.</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Usuários ativos</p>
              <p className="metric-value">{statsQuery.data?.activeUsers ?? 0}</p>
              <p className="metric-footnote">Pessoas com acesso ativo hoje.</p>
            </article>
          </div>
        ) : null}
        </div>
        {isPlatformAdmin && statsQuery.data?.retention ? (
          <article className="mt-5 rounded-[1.6rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_92%,var(--color-muted))] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  Retenção e encerramento
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">Proteção contra contas abandonadas</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
                  A política envia avisos aos {statsQuery.data.retention.policy.firstWarningDays},{" "}
                  {statsQuery.data.retention.policy.secondWarningDays} e{" "}
                  {statsQuery.data.retention.policy.closureDays} dias. Se você reativar a regra depois de um período
                  desligada, o sistema segura encerramentos por 7 dias para evitar exclusões em massa de contas antigas.
                </p>
              </div>
              <div className="grid min-w-[250px] gap-3 rounded-[1.2rem] border border-[var(--color-border)]/70 bg-[var(--color-card)] p-4">
                <label className="flex items-center justify-between gap-3 text-sm font-medium">
                  <span>Encerramento automático ativo</span>
                  <input
                    checked={retentionEnabledDraft ?? statsQuery.data.retention.policy.enabled}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                    onChange={(event) => setRetentionEnabledDraft(event.target.checked)}
                    type="checkbox"
                  />
                </label>
                <div className="space-y-2">
                  <Label htmlFor="retention-closure-days">Prazo final de encerramento</Label>
                  <Input
                    id="retention-closure-days"
                    min="90"
                    onChange={(event) => setRetentionClosureDaysDraft(event.target.value)}
                    type="number"
                    value={retentionClosureDaysDraft ?? String(statsQuery.data.retention.policy.closureDays)}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    disabled={retentionPolicyMutation.isPending}
                    onClick={() => retentionPolicyMutation.mutate()}
                    type="button"
                    variant="secondary"
                  >
                    {retentionPolicyMutation.isPending ? "Salvando..." : "Salvar política"}
                  </Button>
                  <Button
                    disabled={retentionRunMutation.isPending}
                    onClick={() => retentionRunMutation.mutate(true)}
                    type="button"
                    variant="secondary"
                  >
                    {retentionRunMutation.isPending ? "Simulando..." : "Simular agora"}
                  </Button>
                </div>
                <Button
                  disabled={retentionRunMutation.isPending || !statsQuery.data.retention.policy.enabled}
                  onClick={() => retentionRunMutation.mutate(false)}
                  type="button"
                >
                  {retentionRunMutation.isPending ? "Executando..." : "Executar rotina"}
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-[1.1rem] border border-[var(--color-border)]/70 bg-[var(--color-card)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">Inatividade 30/60</p>
                <p className="mt-2 text-lg font-semibold">
                  {statsQuery.data.retention.inactiveAccounts30} / {statsQuery.data.retention.inactiveAccounts60}
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Contas já em trilha de aviso.</p>
              </div>
              <div className="rounded-[1.1rem] border border-[var(--color-border)]/70 bg-[var(--color-card)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">Trial 30/60</p>
                <p className="mt-2 text-lg font-semibold">
                  {statsQuery.data.retention.trialNonPayment30} / {statsQuery.data.retention.trialNonPayment60}
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Trials vencidos sem assinatura.</p>
              </div>
              <div className="rounded-[1.1rem] border border-[var(--color-border)]/70 bg-[var(--color-card)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">Prontas para encerrar</p>
                <p className="mt-2 text-lg font-semibold">{statsQuery.data.retention.closureDue}</p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  Considera o prazo final de {statsQuery.data.retention.policy.closureDays} dias.
                </p>
              </div>
              <div className="rounded-[1.1rem] border border-[var(--color-border)]/70 bg-[var(--color-card)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">Protegidas pela reativação</p>
                <p className="mt-2 text-lg font-semibold">{statsQuery.data.retention.protectedDuringGrace}</p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  {statsQuery.data.retention.policy.graceUntil
                    ? `Janela segura até ${formatDateTimeDisplay(statsQuery.data.retention.policy.graceUntil)}.`
                    : "Sem janela extra de proteção aberta."}
                </p>
              </div>
              <div className="rounded-[1.1rem] border border-[var(--color-border)]/70 bg-[var(--color-card)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">Avisos nos últimos 30 dias</p>
                <p className="mt-2 text-lg font-semibold">{statsQuery.data.retention.warningEmailsLast30Days}</p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  {statsQuery.data.retention.lastRunAt
                    ? `Última varredura em ${formatDateTimeDisplay(statsQuery.data.retention.lastRunAt)}.`
                    : "Nenhuma varredura administrativa registrada ainda."}
                </p>
              </div>
            </div>
          </article>
        ) : null}
        {isPlatformAdmin ? null : (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_88%,var(--color-muted))] px-4 py-4">
            <p className="min-w-0 flex-1 break-words text-sm leading-7 text-[var(--color-muted-foreground)]">
              Para compartilhar a mesma carteira com cônjuge ou familiar, use a área dedicada de compartilhamento.
            </p>
            <Button asChild className="w-full sm:w-auto" variant="secondary">
              <Link href="/dashboard/sharing">Abrir convites</Link>
            </Button>
          </div>
        )}
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
          <details className="admin-disclosure mt-6">
            <summary className="admin-disclosure-summary">
              <div>
                <p className="admin-disclosure-kicker">Cadastro</p>
                <p className="admin-disclosure-title">Novo plano</p>
              </div>
              <p className="admin-disclosure-copy">Abra somente quando precisar criar um novo pacote comercial.</p>
            </summary>
            <div className="admin-disclosure-body">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
          </details>
        ) : null}
        <div className={plansLayoutClassName}>
          {plans.map((plan) => (
            <AdminPlanCard
              key={plan.id}
              deleteDisabled={deletePlanMutation.isPending || plan.tenantsCount > 0}
              isPlatformAdmin={isPlatformAdmin}
              onDelete={() => deletePlanMutation.mutate(plan.id)}
              onPlanDescriptionChange={(value) =>
                setPlanDescriptionDrafts((current) => ({
                  ...current,
                  [plan.id]: value
                }))
              }
              onPlanMaxAccountsChange={(value) =>
                setPlanMaxAccountsDrafts((current) => ({
                  ...current,
                  [plan.id]: value
                }))
              }
              onPlanMaxCardsChange={(value) =>
                setPlanMaxCardsDrafts((current) => ({
                  ...current,
                  [plan.id]: value
                }))
              }
              onPlanNameChange={(value) =>
                setPlanNameDrafts((current) => ({
                  ...current,
                  [plan.id]: value
                }))
              }
              onPlanTrialDaysChange={(value) =>
                setPlanTrialDaysDrafts((current) => ({
                  ...current,
                  [plan.id]: value
                }))
              }
              onSubmitPlanDescription={() => submitPlanDescription(plan)}
              onSubmitPlanMaxAccounts={() => submitPlanMaxAccounts(plan)}
              onSubmitPlanMaxCards={() => submitPlanMaxCards(plan)}
              onSubmitPlanName={() => submitPlanName(plan)}
              onSubmitPlanTrialDays={() => submitPlanTrialDays(plan)}
              onToggleActive={() =>
                updatePlanMutation.mutate({
                  id: plan.id,
                  data: { isActive: !plan.isActive }
                })
              }
              onToggleAutomation={() =>
                updatePlanMutation.mutate({
                  id: plan.id,
                  data: { automation: !plan.features.automation }
                })
              }
              onTogglePdfExport={() =>
                updatePlanMutation.mutate({
                  id: plan.id,
                  data: { pdfExport: !plan.features.pdfExport }
                })
              }
              onToggleWhatsapp={() =>
                updatePlanMutation.mutate({
                  id: plan.id,
                  data: { whatsappAssistant: !plan.features.whatsappAssistant }
                })
              }
              plan={plan}
              planDescriptionDraft={planDescriptionDrafts[plan.id] ?? plan.description ?? ''}
              planMaxAccountsDraft={planMaxAccountsDrafts[plan.id] ?? (plan.maxAccounts?.toString() ?? '')}
              planMaxCardsDraft={planMaxCardsDrafts[plan.id] ?? (plan.maxCards?.toString() ?? '')}
              planNameDraft={planNameDrafts[plan.id] ?? plan.name}
              planTrialDaysDraft={planTrialDaysDrafts[plan.id] ?? String(plan.trialDays)}
            />
          ))}
        </div>
      </section>

      <div className={statsLayoutClassName}>
        <article className="metric-card min-w-0"><p className="metric-label">Contas</p><p className="metric-value">{statsQuery.data?.totalTenants ?? 0}</p></article>
        <article className="metric-card min-w-0"><p className="metric-label">Ativos</p><p className="metric-value">{statsQuery.data?.activeTenants ?? 0}</p></article>
        <article className="metric-card min-w-0"><p className="metric-label">Em avaliação</p><p className="metric-value">{statsQuery.data?.trialTenants ?? 0}</p></article>
        <article className="metric-card min-w-0"><p className="metric-label">Expirados</p><p className="metric-value">{statsQuery.data?.expiredTenants ?? 0}</p></article>
        <article className="metric-card min-w-0">
          <p className="metric-label">{isPlatformAdmin ? "Usuários cadastrados" : "Pessoas da conta"}</p>
          <p className="metric-value">{statsQuery.data?.totalUsers ?? 0}</p>
        </article>
        <article className="metric-card min-w-0">
          <p className="metric-label">{isPlatformAdmin ? "Usuários ativos" : "Pessoas ativas"}</p>
          <p className="metric-value">{statsQuery.data?.activeUsers ?? 0}</p>
        </article>
        {isPlatformAdmin ? (
          <>
            <article className="metric-card min-w-0">
              <p className="metric-label">Assinaturas MP ativas</p>
              <p className="metric-value">{statsQuery.data?.billingActiveSubscriptions ?? 0}</p>
            </article>
            <article className="metric-card min-w-0">
              <p className="metric-label">Recorrências internas</p>
              <p className="metric-value">{statsQuery.data?.internalActiveSubscriptions ?? 0}</p>
            </article>
            <article className="metric-card min-w-0">
              <p className="metric-label">Billing alerta</p>
              <p className="metric-value">{statsQuery.data?.billingAttentionSubscriptions ?? 0}</p>
            </article>
            <article className="metric-card min-w-0">
              <p className="metric-label">Fila webhooks</p>
              <p className="metric-value">{statsQuery.data?.billingWebhookQueueDepth ?? 0}</p>
            </article>
            <article className="metric-card min-w-0">
              <p className="metric-label">Falhas webhook</p>
              <p className="metric-value">{statsQuery.data?.billingWebhookFailures ?? 0}</p>
            </article>
          </>
        ) : null}
        {isPlatformAdmin ? null : (
          <article className="metric-card min-w-0"><p className="metric-label">Transações</p><p className="metric-value">{statsQuery.data?.totalTransactions ?? 0}</p></article>
        )}
      </div>

      {isPlatformAdmin ? <PopupCampaignManager /> : null}

      <div className={adminSectionsLayoutClassName}>
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
            <details className="admin-disclosure mt-6">
              <summary className="admin-disclosure-summary">
                <div>
                  <p className="admin-disclosure-kicker">Cadastro</p>
                  <p className="admin-disclosure-title">Nova conta</p>
                </div>
                <p className="admin-disclosure-copy">Abra quando precisar provisionar uma conta nova com plano inicial.</p>
              </summary>
              <div className="admin-disclosure-body">
                <div className="grid gap-3 md:grid-cols-3">
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
            </details>
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
              <AdminTenantCard
                key={tenant.id}
                activeTenantBillingId={activeTenantBillingId}
                billingActionDisabled={adminTenantBillingMutation.isPending}
                billingDetailsPanel={
                  activeTenantBillingId === tenant.id ? (
                    <div className="mt-4 rounded-[1.4rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_92%,var(--color-muted))] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                            Suporte financeiro e reparos
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
                          <div className={`grid gap-3 ${isPlatformAdmin ? "xl:grid-cols-2" : "lg:grid-cols-3"}`}>
                            <div className="muted-panel rounded-[1.2rem] p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Assinatura</p>
                              <div className="mt-2 space-y-1 text-xs text-[var(--color-muted-foreground)]">
                                <p>Status: {formatBillingSubscriptionLabel(tenantBillingDetailsQuery.data.subscription?.status ?? null)}</p>
                                <p className="break-words">Preapproval: {tenantBillingDetailsQuery.data.subscription?.mercadoPagoPreapprovalId ?? "não vinculado"}</p>
                                <p className="break-words">Pagador: {tenantBillingDetailsQuery.data.subscription?.payerEmail || "não informado"}</p>
                                <p>
                                  Próxima cobrança:{" "}
                                  {tenantBillingDetailsQuery.data.subscription?.nextBillingAt
                                    ? formatDateTimeDisplay(tenantBillingDetailsQuery.data.subscription.nextBillingAt)
                                    : "não exposta"}
                                </p>
                              </div>
                            </div>
                            <div className="muted-panel rounded-[1.2rem] p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Pagamentos recentes</p>
                              <div className="mt-2 space-y-2 text-xs text-[var(--color-muted-foreground)]">
                                {tenantBillingDetailsQuery.data.subscription?.payments.length ? (
                                  tenantBillingDetailsQuery.data.subscription.payments.map((payment) => (
                                    <div key={payment.id} className="rounded-2xl border border-[var(--color-border)] px-3 py-2">
                                      <p className="break-words font-medium text-[var(--color-foreground)]">
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
                            <div className="muted-panel rounded-[1.2rem] p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Webhooks recentes</p>
                              <div className="mt-2 space-y-2 text-xs text-[var(--color-muted-foreground)]">
                                {tenantBillingDetailsQuery.data.webhookEvents.length ? (
                                  tenantBillingDetailsQuery.data.webhookEvents.slice(0, 5).map((event) => (
                                    <div key={event.id} className="rounded-2xl border border-[var(--color-border)] px-3 py-2">
                                      <p className="font-medium text-[var(--color-foreground)]">{event.topic}</p>
                                      <p>{event.status} • tentativas {event.attempts}</p>
                                      <p>{formatDateTimeDisplay(event.createdAt)}</p>
                                      {event.error ? (
                                        <p className="break-words text-[var(--color-destructive)]">{event.error}</p>
                                      ) : null}
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
                                Reparo de dízimo disponível no card
                              </p>
                              <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
                                O campo de competência e o botão de recálculo ficam sempre visíveis no suporte operacional acima.
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null
                }
                deleteTenantDisabled={deleteTenantMutation.isPending}
                isPlatformAdmin={isPlatformAdmin}
                onApplyExpiryDate={() => submitTenantExpiryDate(tenant)}
                onApplyPlan={() =>
                  updateTenantMutation.mutate({
                    id: tenant.id,
                    planId: tenantPlanDrafts[tenant.id] ?? tenant.planId
                  })
                }
                onApplyTrialDays={() => submitTenantTrialDays(tenant)}
                onDeleteTenant={() => submitTenantDeletion(tenant)}
                onOpenBillingDetails={() => setExpandedTenantBillingId(tenant.id)}
                onProcessQueue={() =>
                  adminTenantBillingMutation.mutate({
                    tenantId: tenant.id,
                    action: "process_queue"
                  })
                }
                onRecalculateTithe={() => submitTenantTitheRecalculation(tenant)}
                onReconcileInstallments={() =>
                  adminTenantBillingMutation.mutate({
                    tenantId: tenant.id,
                    action: "reconcile_due_installments"
                  })
                }
                onSyncDueSubscriptions={() =>
                  adminTenantBillingMutation.mutate({
                    tenantId: tenant.id,
                    action: "sync_due_subscriptions"
                  })
                }
                onSyncSubscription={() =>
                  adminTenantBillingMutation.mutate({
                    tenantId: tenant.id,
                    action: "sync_subscription"
                  })
                }
                onTenantDeleteConfirmChange={(value) =>
                  setTenantDeleteConfirmDrafts((current) => ({
                    ...current,
                    [tenant.id]: value
                  }))
                }
                onTenantExpiryChange={(value) =>
                  setTenantExpiryDrafts((current) => ({
                    ...current,
                    [tenant.id]: value
                  }))
                }
                onTenantPlanChange={(value) =>
                  setTenantPlanDrafts((current) => ({
                    ...current,
                    [tenant.id]: value
                  }))
                }
                onTenantTitheChange={(value) =>
                  setTenantTitheDrafts((current) => ({
                    ...current,
                    [tenant.id]: value
                  }))
                }
                onTenantTrialChange={(value) =>
                  setTenantTrialDrafts((current) => ({
                    ...current,
                    [tenant.id]: value
                  }))
                }
                onToggleActive={() => updateTenantMutation.mutate({ id: tenant.id, isActive: !tenant.isActive })}
                plans={plans}
                tenant={tenant}
                tenantDeleteConfirmDraft={tenantDeleteConfirmDrafts[tenant.id] ?? ""}
                tenantExpiryDraft={tenantExpiryDrafts[tenant.id] ?? (tenant.expiresAt ? formatDateDisplay(tenant.expiresAt) : "")}
                tenantPlanDraft={tenantPlanDrafts[tenant.id] ?? tenant.planId}
                tenantTitheDraft={tenantTitheDrafts[tenant.id] ?? new Date().toISOString().slice(0, 7)}
                tenantTrialDraft={tenantTrialDrafts[tenant.id] ?? String(tenant.trialDays)}
              />
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
                  <AdminUserCard
                    key={user.id}
                    deleteUserDisabled={deleteUserMutation.isPending}
                    getTenantLabel={getTenantLabel}
                    isPlatformAdmin={isPlatformAdmin}
                    moveTenantDisabled={(userTenantDrafts[user.id] ?? user.tenant.id) === user.tenant.id || moveUserTenantMutation.isPending}
                    onDeleteUser={() => submitUserDeletion(user)}
                    onMoveTenant={() =>
                      moveUserTenantMutation.mutate({
                        id: user.id,
                        tenantId: userTenantDrafts[user.id] ?? user.tenant.id
                      })
                    }
                    onSubmitPasswordReset={() => submitUserPasswordReset(user)}
                    onToggleActive={() => toggleActiveMutation.mutate({ id: user.id, isActive: !user.isActive })}
                    onToggleRole={() => toggleRoleMutation.mutate({ id: user.id, role: user.role === 'admin' ? 'member' : 'admin' })}
                    onUserDeleteConfirmChange={(value) =>
                      setUserDeleteConfirmDrafts((current) => ({
                        ...current,
                        [user.id]: value
                      }))
                    }
                    onUserPasswordChange={(value) =>
                      setUserPasswordDrafts((current) => ({
                        ...current,
                        [user.id]: value
                      }))
                    }
                    onUserTenantChange={(value) =>
                      setUserTenantDrafts((current) => ({
                        ...current,
                        [user.id]: value
                      }))
                    }
                    passwordActionDisabled={
                      isPlatformAdmin
                        ? sendPasswordResetMutation.isPending
                        : (userPasswordDrafts[user.id] ?? '').length < 8 || setPasswordMutation.isPending
                    }
                    tenants={tenants}
                    user={user}
                    userDeleteConfirmDraft={userDeleteConfirmDrafts[user.id] ?? ''}
                    userPasswordDraft={userPasswordDrafts[user.id] ?? ''}
                    userTenantDraft={userTenantDrafts[user.id] ?? user.tenant.id}
                  />
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
                <AdminInvitationCard
                  key={invitation.id}
                  invitation={invitation}
                  onResend={() => resendInvitationMutation.mutate(invitation.id)}
                  onRevoke={() => revokeInvitationMutation.mutate(invitation.id)}
                  resendDisabled={resendInvitationMutation.isPending}
                  revokeDisabled={revokeInvitationMutation.isPending}
                />
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
            {isPlatformAdmin ? null : (
              <Button asChild className="w-full sm:w-auto">
                <Link href="/dashboard/sharing">Abrir compartilhamento</Link>
              </Button>
            )}
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
            <p className="text-xs text-[var(--color-muted-foreground)]">máx. {auditLimit} linhas</p>
          </article>
        </div>
        <div className="mt-6 space-y-3">
          <div className="filter-shell">
            <p className="filter-kicker">Recorte de auditoria</p>
            <p className="filter-copy">
              Filtre eventos por conta ou ação para ler decisões sensíveis com mais contexto e menos ruído.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
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
              <option value="invitation.resent">Convites reenviados</option>
              <option value="invitation.revoked">Convites revogados</option>
              <option value="billing.subscription.synced">Billing sincronizado</option>
              <option value="billing.queue.reprocessed">Fila de billing reprocessada</option>
              <option value="finance.tithe.recalculated">Dízimo recalculado</option>
              <option value="finance.subscriptions.synced">Recorrências sincronizadas</option>
              <option value="finance.installments.reconciled">Parcelas conciliadas</option>
            </Select>
            <Select onChange={(event) => setAuditLimit(event.target.value)} value={auditLimit}>
              <option value="30">30 linhas</option>
              <option value="60">60 linhas</option>
              <option value="100">100 linhas</option>
            </Select>
          </div>
          {auditItems.map((item) => (
            <article key={item.id} className="data-card p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold leading-6">{item.summary}</p>
                  <p className="break-words text-sm text-[var(--color-muted-foreground)]">
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
