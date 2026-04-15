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

type Stats = {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  expiredTenants: number;
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
  currentTenantUsers: number;
  currentTenantActiveUsers: number;
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

function formatRoleLabel(role: "admin" | "member") {
  return role === "admin" ? "Administrador" : "Membro";
}

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
  const invitationForm = useForm<z.input<typeof invitationSchema>, unknown, InvitationValues>({
    resolver: zodResolver(invitationSchema),
    defaultValues: {
      email: "",
      name: "",
      role: "member"
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
      if (!response.ok) throw new Error("Falha ao atualizar tenant");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success("Tenant atualizado");
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

  const createInvitationMutation = useMutation({
    mutationFn: async (values: InvitationValues) => {
      if (isPlatformAdmin && !invitePlanId) {
        throw new Error("Selecione o plano inicial do usuario");
      }

      const payload = isPlatformAdmin ? { ...values, planId: invitePlanId } : values;
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
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    onClick={() => {
                      const nextName = window.prompt(`Novo nome para ${plan.name}`, plan.name);
                      if (nextName === null || !nextName.trim()) return;
                      updatePlanMutation.mutate({ id: plan.id, data: { name: nextName.trim() } });
                    }}
                    type="button"
                    variant="secondary"
                  >
                    Nome
                  </Button>
                  <Button
                    onClick={() => {
                      const nextDescription = window.prompt(`Descrição do plano ${plan.name}`, plan.description || "");
                      if (nextDescription === null) return;
                      updatePlanMutation.mutate({ id: plan.id, data: { description: nextDescription } });
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Descrição
                  </Button>
                  <Button
                    onClick={() => {
                      const nextMaxAccounts = window.prompt(`Novo limite de contas para ${plan.name}`, plan.maxAccounts?.toString() || "");
                      if (nextMaxAccounts === null) return;
                      updatePlanMutation.mutate({ id: plan.id, data: { maxAccounts: parseNullableLimit(nextMaxAccounts) } });
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Contas
                  </Button>
                  <Button
                    onClick={() => {
                      const nextMaxCards = window.prompt(`Novo limite de cartões para ${plan.name}`, plan.maxCards?.toString() || "");
                      if (nextMaxCards === null) return;
                      updatePlanMutation.mutate({ id: plan.id, data: { maxCards: parseNullableLimit(nextMaxCards) } });
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Cartões
                  </Button>
                  <Button
                    onClick={() => {
                      const nextTrialDays = window.prompt(`Dias de avaliação para ${plan.name}`, String(plan.trialDays));
                      if (nextTrialDays === null) return;
                      const parsed = Number(nextTrialDays);
                      if (Number.isFinite(parsed) && parsed >= 0) {
                        updatePlanMutation.mutate({ id: plan.id, data: { trialDays: parsed } });
                      }
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Avaliação
                  </Button>
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
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <article className="metric-card"><p className="metric-label">Contas</p><p className="metric-value">{statsQuery.data?.totalTenants ?? 0}</p></article>
        <article className="metric-card"><p className="metric-label">Ativos</p><p className="metric-value">{statsQuery.data?.activeTenants ?? 0}</p></article>
        <article className="metric-card"><p className="metric-label">Em avaliação</p><p className="metric-value">{statsQuery.data?.trialTenants ?? 0}</p></article>
        <article className="metric-card"><p className="metric-label">Expirados</p><p className="metric-value">{statsQuery.data?.expiredTenants ?? 0}</p></article>
        <article className="metric-card">
          <p className="metric-label">{isPlatformAdmin ? "Pessoas da plataforma" : "Pessoas da conta"}</p>
          <p className="metric-value">{statsQuery.data?.totalUsers ?? 0}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">{isPlatformAdmin ? "Pessoas ativas da plataforma" : "Pessoas ativas"}</p>
          <p className="metric-value">{statsQuery.data?.activeUsers ?? 0}</p>
        </article>
        {isPlatformAdmin ? (
          <>
            <article className="metric-card">
              <p className="metric-label">Pessoas nesta conta</p>
              <p className="metric-value">{statsQuery.data?.currentTenantUsers ?? 0}</p>
            </article>
            <article className="metric-card">
              <p className="metric-label">Pessoas ativas nesta conta</p>
              <p className="metric-value">{statsQuery.data?.currentTenantActiveUsers ?? 0}</p>
            </article>
          </>
        ) : null}
        <article className="metric-card"><p className="metric-label">Transações</p><p className="metric-value">{statsQuery.data?.totalTransactions ?? 0}</p></article>
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
              <p className="metric-label">Listadas</p>
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
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                onChange={(event) => setTenantSearch(event.target.value)}
                placeholder="Buscar por conta ou identificador"
                value={tenantSearch}
              />
              <Select onChange={(event) => setTenantPlanFilter(event.target.value)} value={tenantPlanFilter}>
                <option value="">Todos os planos</option>
                <option value="free">Gratuito</option>
                <option value="pro">Premium</option>
              </Select>
              <Select onChange={(event) => setTenantStatusFilter(event.target.value)} value={tenantStatusFilter}>
                <option value="">Todos os estados</option>
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
                    <p className="font-semibold">{tenant.name}</p>
                    <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                      Conta {tenant.slug} • Plano {tenant.planName}
                    </p>
                    <p className="break-words text-xs text-[var(--color-muted-foreground)]">
                      {formatLifecycleLabel(tenant)}
                    </p>
                  </div>
                  <div className="w-full shrink-0 sm:w-auto sm:text-right">
                    <p className="text-sm font-semibold">{tenant.activeUsers}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">pessoas ativas</p>
                  </div>
                </div>
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
                  <Button
                    onClick={() => {
                      const nextTrialDays = window.prompt(`Novos dias de avaliação para ${tenant.name}`, String(tenant.trialDays));
                      if (!nextTrialDays) return;
                      const parsed = Number(nextTrialDays);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        updateTenantMutation.mutate({ id: tenant.id, trialDays: parsed });
                      }
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Avaliação
                  </Button>
                  <Button
                    onClick={() => {
                      const nextExpiresAt = window.prompt(
                        `Nova data de expiração DD/MM/AAAA para ${tenant.name}`,
                        tenant.expiresAt ? formatDateDisplay(tenant.expiresAt) : ""
                      );
                      if (nextExpiresAt === null) return;
                      if (!nextExpiresAt.trim()) {
                        updateTenantMutation.mutate({ id: tenant.id, expiresAt: null });
                        return;
                      }
                      const parsedExpiresAt = parseBrazilianDateToDateKey(nextExpiresAt);
                      if (!parsedExpiresAt) {
                        toast.error("Informe a data no formato DD/MM/AAAA");
                        return;
                      }
                      updateTenantMutation.mutate({ id: tenant.id, expiresAt: parsedExpiresAt });
                    }}
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
              <p className="metric-label">Listados</p>
              <p className="metric-value">{users.length}</p>
            </article>
          </div>
          <div className="mt-6 space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                onChange={(event) => {
                  setUserSearch(event.target.value);
                  setUserPage(1);
                }}
                placeholder="Buscar por nome, e-mail ou conta"
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
                  <option value="">Todas as contas</option>
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
                <option value="">Todos os perfis</option>
                <option value="admin">Administradores</option>
                <option value="member">Membros</option>
              </Select>
              <Select
                onChange={(event) => {
                  setUserStatusFilter(event.target.value);
                  setUserPage(1);
                }}
                value={userStatusFilter}
              >
                <option value="">Todos os status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </Select>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Select
                onChange={(event) => {
                  setUserLastLoginFilter(event.target.value);
                  setUserPage(1);
                }}
                value={userLastLoginFilter}
              >
                <option value="">Qualquer último login</option>
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
                <option value="created_desc">Mais recentes</option>
                <option value="created_asc">Mais antigos</option>
                <option value="login_desc">Último login mais recente</option>
                <option value="name_asc">Nome A-Z</option>
              </Select>
              <div className="flex items-center justify-end text-sm text-[var(--color-muted-foreground)]">
                {usersMeta ? `${usersMeta.total} pessoas encontradas` : "Carregando pessoas..."}
              </div>
            </div>
            {users.map((user) => (
              <article key={user.id} className="data-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{user.name}</p>
                    <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                      {user.email} • {user.tenant.name}
                      {user.isPlatformAdmin ? " • Superadmin" : ""}
                    </p>
                    <p className="break-words text-xs text-[var(--color-muted-foreground)]">
                      Conta {user.tenant.slug} • {formatUserTenantPlanLabel(user)}
                    </p>
                    <p className="break-words text-xs text-[var(--color-muted-foreground)]">
                      Último login: {user.lastLogin ? formatDateTimeDisplay(user.lastLogin) : "Nunca acessou"}
                    </p>
                  </div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                    <Button
                      onClick={() => toggleRoleMutation.mutate({ id: user.id, role: user.role === "admin" ? "member" : "admin" })}
                      type="button"
                      variant="secondary"
                    >
                      Tornar {user.role === "admin" ? "membro" : "administrador"}
                    </Button>
                    <Button
                      onClick={() => {
                        const newPassword = window.prompt(`Nova senha para ${user.name}`);
                        if (newPassword && newPassword.length >= 8) {
                          resetPasswordMutation.mutate({ id: user.id, newPassword });
                        } else if (newPassword) {
                          toast.error("A senha precisa ter ao menos 8 caracteres");
                        }
                      }}
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
                    {!user.isPlatformAdmin ? (
                      <Button
                        className="border-[var(--color-destructive)] text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)]"
                        disabled={deleteUserMutation.isPending}
                        onClick={() => {
                          const confirmation = window.prompt(
                            `Digite ${user.email} para excluir definitivamente esta pessoa e todos os dados vinculados.`
                          );

                          if (!confirmation) {
                            return;
                          }

                          if (confirmation.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
                            toast.error("O e-mail informado não confere");
                            return;
                          }

                          deleteUserMutation.mutate(user.id);
                        }}
                        type="button"
                        variant="ghost"
                      >
                        Excluir definitivamente
                      </Button>
                    ) : null}
                  </div>
                </div>
                {isPlatformAdmin && !user.isPlatformAdmin ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
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
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <section className="surface content-section">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">Convidar novo usuário isolado</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
            Este convite cria uma nova carteira vazia para a pessoa. Para compartilhar a sua própria carteira, use o módulo Compartilhamento.
          </p>
          <form
            className="mt-6 space-y-4"
            onSubmit={invitationForm.handleSubmit(
              (values) => createInvitationMutation.mutate(values),
              (errors) => {
                const firstError =
                  errors.name?.message || errors.email?.message || errors.role?.message;
                toast.error(firstError ?? "Revise os dados do convite");
              }
            )}
          >
            {isPlatformAdmin ? (
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
                        Selecione explicitamente se o usuario entrara no plano gratuito, premium ou outro plano ativo.
                      </p>
                    );
                  }

                  const selectedTenant = {
                    name: "uma carteira nova e vazia",
                    planName: selectedPlan.name
                  };

                  return (
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      A pessoa convidada entrará na conta <strong>{selectedTenant.name}</strong> com plano{" "}
                      <strong>{selectedTenant.planName}</strong>. Pessoas não têm limite por plano.
                    </p>
                  );
                })()}
              </div>
            ) : null}
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
              <Label htmlFor="invite-user-role">Perfil</Label>
              <Select id="invite-user-role" {...invitationForm.register("role")}>
                <option value="member">Membro</option>
                <option value="admin">Administrador</option>
              </Select>
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
              <p className="metric-label">Convites</p>
              <p className="metric-value">{invitations.length}</p>
            </article>
          </div>
          <div className="mt-6 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                onChange={(event) => setInvitationSearch(event.target.value)}
                placeholder="Buscar convites por nome ou e-mail"
                value={invitationSearch}
              />
              {isPlatformAdmin ? (
                <Select onChange={(event) => setInvitationTenantFilter(event.target.value)} value={invitationTenantFilter}>
                  <option value="">Todas as contas</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <div />
              )}
            </div>
            {invitations.map((invitation) => (
              <article key={invitation.id} className="data-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{invitation.name}</p>
                    <p className="break-words text-sm text-[var(--color-muted-foreground)]">{invitation.email} • {formatRoleLabel(invitation.role)}</p>
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

      <section className="surface content-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Auditoria administrativa</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Acompanhe alterações sensíveis em pessoas, convites, contas e planos.
            </p>
          </div>
          <article className="metric-card w-full sm:w-auto">
            <p className="metric-label">Eventos</p>
            <p className="metric-value">{auditItems.length}</p>
          </article>
        </div>
        <div className="mt-6 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              onChange={(event) => setAuditSearch(event.target.value)}
              placeholder="Buscar na auditoria"
              value={auditSearch}
            />
            {isPlatformAdmin ? (
              <Select onChange={(event) => setAuditTenantFilter(event.target.value)} value={auditTenantFilter}>
                <option value="">Todas as contas</option>
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
              <option value="">Todas as ações</option>
              <option value="user.updated">Pessoas atualizadas</option>
              <option value="tenant.updated">Contas atualizadas</option>
              <option value="plan.created">Planos criados</option>
              <option value="plan.updated">Planos atualizados</option>
              <option value="plan.deleted">Planos excluídos</option>
              <option value="invitation.created">Convites criados</option>
              <option value="invitation.revoked">Convites revogados</option>
            </Select>
          </div>
          {auditItems.map((item) => (
            <article key={item.id} className="data-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.summary}</p>
                  <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                    {item.actorUser.name} • {item.actorUser.email}
                    {item.targetTenant ? ` • ${item.targetTenant.name}` : ""}
                    {item.targetUser ? ` • ${item.targetUser.email}` : ""}
                  </p>
                </div>
                <p className="w-full break-words text-xs text-[var(--color-muted-foreground)] sm:w-auto sm:text-right">
                  {formatDateTimeDisplay(item.createdAt)}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
