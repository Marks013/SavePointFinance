"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { invitationSchema, type InvitationValues } from "@/features/password/schemas/password-schema";

type Stats = {
  totalTenants: number;
  activeTenants: number;
  trialTenants: number;
  expiredTenants: number;
  totalUsers: number;
  activeUsers: number;
  totalTransactions: number;
};

type TenantItem = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  maxUsers: number;
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
    plan: string;
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

type PlanPreset = {
  id: string;
  title: string;
  badge: string;
  description: string;
  plan: "free" | "pro";
  maxUsers: number;
  trialDays?: number;
  expiresAt?: null;
};

const PLAN_PRESETS: PlanPreset[] = [
  {
    id: "free-essential",
    title: "Gratuito Essencial",
    badge: "Padrão",
    description: "Plano base para operação enxuta, com limites reduzidos e recursos premium desativados.",
    plan: "free",
    maxUsers: 1
  },
  {
    id: "premium-team",
    title: "Premium Completo",
    badge: "Recomendado",
    description: "Plano completo com usuários extras, relatórios PDF, automações e assistente no WhatsApp.",
    plan: "pro",
    maxUsers: 10
  },
  {
    id: "premium-trial-14",
    title: "Avaliação Premium 14 dias",
    badge: "Teste",
    description: "Ativa o Premium por 14 dias para onboarding, validação comercial e implantação inicial.",
    plan: "pro",
    maxUsers: 10,
    trialDays: 14
  }
];

function formatRoleLabel(role: "admin" | "member") {
  return role === "admin" ? "Administrador" : "Membro";
}

function formatPlanLabel(plan: string) {
  return plan === "pro" ? "Premium" : "Gratuito";
}

function formatLifecycleLabel(tenant: TenantItem) {
  if (tenant.expiresAt) {
    return `Expira em ${new Date(tenant.expiresAt).toLocaleDateString("pt-BR")}`;
  }

  if (tenant.plan === "pro" && tenant.trialExpiresAt) {
    return `Avaliação até ${new Date(tenant.trialExpiresAt).toLocaleDateString("pt-BR")}`;
  }

  return tenant.isActive ? "Sem vencimento configurado" : "Organização inativa";
}

function formatUserTenantPlanLabel(user: UserItem) {
  if (user.tenant.expiresAt) {
    return `${formatPlanLabel(user.tenant.plan)} • Expirado`;
  }

  if (user.tenant.plan === "pro" && user.tenant.trialExpiresAt) {
    return `${formatPlanLabel(user.tenant.plan)} • Em avaliação`;
  }

  return `${formatPlanLabel(user.tenant.plan)} • ${user.tenant.isActive ? "Ativo" : "Inativo"}`;
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

async function getStats() {
  const response = await fetch("/api/admin/stats", { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar stats");
  return (await response.json()) as Stats;
}

async function getTenants(filters: { search?: string; plan?: string; status?: string }) {
  const response = await fetch(`/api/admin/tenants${buildQuery(filters)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Falha ao carregar tenants");
  return (await response.json()) as { items: TenantItem[] };
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
  const [newTenantName, setNewTenantName] = useState("");
  const [newTenantSlug, setNewTenantSlug] = useState("");
  const [newTenantPlan, setNewTenantPlan] = useState<"free" | "pro">("free");
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
  const [inviteTenantId, setInviteTenantId] = useState("");
  const [invitationSearch, setInvitationSearch] = useState("");
  const [invitationTenantFilter, setInvitationTenantFilter] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditTenantFilter, setAuditTenantFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const invitationForm = useForm<InvitationValues>({
    resolver: zodResolver(invitationSchema),
    defaultValues: {
      email: "",
      name: "",
      role: "member"
    }
  });
  const statsQuery = useQuery({ queryKey: ["admin-stats"], queryFn: getStats });
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getCurrentProfile });
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
  const tenants = tenantsQuery.data?.items ?? [];
  const users = usersQuery.data?.items ?? [];
  const usersMeta = usersQuery.data;
  const invitations = invitationsQuery.data?.items ?? [];
  const auditItems = auditQuery.data?.items ?? [];
  const isPlatformAdmin = Boolean(profileQuery.data?.isPlatformAdmin);

  function applyPlanPreset(tenantId: string, preset: PlanPreset) {
    updateTenantMutation.mutate({
      id: tenantId,
      plan: preset.plan,
      maxUsers: preset.maxUsers,
      trialDays: preset.trialDays ?? 0,
      trialExpiresAt: null,
      expiresAt: preset.expiresAt ?? null,
      isActive: true
    });
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
      if (!response.ok) throw new Error("Falha ao atualizar usuario");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
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
      toast.success("Perfil do usuário atualizado");
    }
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({
      id,
      plan,
      maxUsers,
      isActive,
      trialDays,
      trialExpiresAt,
      expiresAt
    }: {
      id: string;
      plan?: "free" | "pro";
      maxUsers?: number;
      isActive?: boolean;
      trialDays?: number;
      trialExpiresAt?: string | null;
      expiresAt?: string | null;
    }) => {
      const response = await fetch(`/api/admin/tenants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, maxUsers, isActive, trialDays, trialExpiresAt, expiresAt })
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
      const response = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTenantName,
          slug: newTenantSlug,
          plan: newTenantPlan,
          maxUsers: newTenantPlan === "pro" ? 10 : 1,
          trialDays: 0
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Falha ao criar organização");
      }
    },
    onSuccess: async () => {
      setNewTenantName("");
      setNewTenantSlug("");
      setNewTenantPlan("free");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-tenants"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-stats"] })
      ]);
      toast.success("Organização criada");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const createInvitationMutation = useMutation({
    mutationFn: async (values: InvitationValues) => {
      const payload = isPlatformAdmin
        ? { ...values, tenantId: inviteTenantId || tenants[0]?.id }
        : values;
      const response = await fetch("/api/admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const payload = (await response.json()) as { message?: string };
        throw new Error(payload.message ?? "Falha ao criar convite");
      }

      return (await response.json()) as { inviteUrl: string };
    },
    onSuccess: async (payload) => {
      invitationForm.reset();
      await queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-audit"] });
      const absoluteInviteUrl = toAbsoluteInviteUrl(payload.inviteUrl);
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
          Gerencie organizações, usuários, convites e limites operacionais do ambiente.
        </p>
        <div className="info-banner mt-5">
          <strong>Planos são aplicados por organização.</strong> Usuários convidados herdam o plano, os limites e os recursos premium do tenant ao qual pertencem.
        </div>
        {isPlatformAdmin ? (
          <div className="info-banner mt-5">
            <strong>Superadmin ativo.</strong> A conta principal possui acesso global, recursos Premium e bypass de licença.
          </div>
        ) : null}
      </section>

      <section className="surface content-section">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Planos padrão</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
              Estes presets aceleram a gestão comercial. Basta aplicar o plano desejado na organização, e todos os usuários dela passam a obedecer a essa licença.
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {PLAN_PRESETS.map((preset) => (
            <article key={preset.id} className="data-card p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">{preset.title}</h3>
                <span className="rounded-full bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] px-3 py-1 text-xs font-semibold text-[var(--color-primary)]">
                  {preset.badge}
                </span>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--color-muted-foreground)]">{preset.description}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--color-muted-foreground)]">
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
                  Plano {formatPlanLabel(preset.plan)}
                </span>
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
                  {preset.maxUsers} usuário{preset.maxUsers > 1 ? "s" : ""}
                </span>
                {preset.trialDays ? (
                  <span className="rounded-full border border-[var(--color-border)] px-3 py-1">
                    {preset.trialDays} dias de avaliação
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        <article className="metric-card"><p className="metric-label">Organizações</p><p className="metric-value">{statsQuery.data?.totalTenants ?? 0}</p></article>
        <article className="metric-card"><p className="metric-label">Ativos</p><p className="metric-value">{statsQuery.data?.activeTenants ?? 0}</p></article>
        <article className="metric-card"><p className="metric-label">Em avaliação</p><p className="metric-value">{statsQuery.data?.trialTenants ?? 0}</p></article>
        <article className="metric-card"><p className="metric-label">Expirados</p><p className="metric-value">{statsQuery.data?.expiredTenants ?? 0}</p></article>
        <article className="metric-card"><p className="metric-label">Usuários</p><p className="metric-value">{statsQuery.data?.totalUsers ?? 0}</p></article>
        <article className="metric-card"><p className="metric-label">Usuários ativos</p><p className="metric-value">{statsQuery.data?.activeUsers ?? 0}</p></article>
        <article className="metric-card"><p className="metric-label">Transações</p><p className="metric-value">{statsQuery.data?.totalTransactions ?? 0}</p></article>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="surface content-section">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Organizações</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                Ajuste plano, avaliação, capacidade e status operacional de cada ambiente.
              </p>
            </div>
            <article className="metric-card">
              <p className="metric-label">Listadas</p>
              <p className="metric-value">{tenants.length}</p>
            </article>
          </div>
          {isPlatformAdmin ? (
            <div className="mt-6 rounded-[1.6rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_88%,var(--color-muted))] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">Nova organização</h3>
                  <p className="mt-1 text-sm leading-7 text-[var(--color-muted-foreground)]">
                    Crie uma nova organização já com plano inicial, slug limpo e categorias padrão prontas para uso.
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <Input
                  onChange={(event) => setNewTenantName(event.target.value)}
                  placeholder="Nome da organização"
                  value={newTenantName}
                />
                <Input
                  onChange={(event) => setNewTenantSlug(event.target.value)}
                  placeholder="Slug da organização"
                  value={newTenantSlug}
                />
                <Select onChange={(event) => setNewTenantPlan(event.target.value as "free" | "pro")} value={newTenantPlan}>
                  <option value="free">Plano Gratuito</option>
                  <option value="pro">Plano Premium</option>
                </Select>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  O plano é da organização. Depois, basta convidar usuários para esse tenant.
                </p>
                <Button
                  disabled={createTenantMutation.isPending || !newTenantName.trim()}
                  onClick={() => createTenantMutation.mutate()}
                  type="button"
                >
                  {createTenantMutation.isPending ? "Criando organização..." : "Criar organização"}
                </Button>
              </div>
            </div>
          ) : null}
          <div className="mt-6 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                onChange={(event) => setTenantSearch(event.target.value)}
                placeholder="Buscar por organização ou slug"
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
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{tenant.name}</p>
                    <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                      Organização {tenant.slug} • Plano {formatPlanLabel(tenant.plan)}
                    </p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      {formatLifecycleLabel(tenant)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{tenant.activeUsers}/{tenant.maxUsers}</p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">usuários ativos / limite</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      updateTenantMutation.mutate({
                        id: tenant.id,
                        plan: tenant.plan === "free" ? "pro" : "free"
                      })
                    }
                    type="button"
                    variant="secondary"
                  >
                    Mudar para {tenant.plan === "free" ? "Premium" : "Gratuito"}
                  </Button>
                  <Button
                    onClick={() => applyPlanPreset(tenant.id, PLAN_PRESETS[0])}
                    type="button"
                    variant="ghost"
                  >
                    Aplicar Gratuito
                  </Button>
                  <Button
                    onClick={() => applyPlanPreset(tenant.id, PLAN_PRESETS[1])}
                    type="button"
                    variant="ghost"
                  >
                    Aplicar Premium
                  </Button>
                  <Button
                    onClick={() => applyPlanPreset(tenant.id, PLAN_PRESETS[2])}
                    type="button"
                    variant="ghost"
                  >
                    Aplicar avaliação 14 dias
                  </Button>
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
                      const nextMaxUsers = window.prompt(`Novo limite de usuários para ${tenant.name}`, String(tenant.maxUsers));
                      if (!nextMaxUsers) return;
                      const parsed = Number(nextMaxUsers);
                      if (Number.isFinite(parsed) && parsed > 0) {
                        updateTenantMutation.mutate({ id: tenant.id, maxUsers: parsed });
                      }
                    }}
                    type="button"
                    variant="ghost"
                  >
                    Limite
                  </Button>
                  <Button
                    onClick={() => {
                      const nextExpiresAt = window.prompt(`Nova data de expiração AAAA-MM-DD para ${tenant.name}`, tenant.expiresAt ? tenant.expiresAt.slice(0, 10) : "");
                      if (nextExpiresAt === null) return;
                      updateTenantMutation.mutate({ id: tenant.id, expiresAt: nextExpiresAt || null });
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Usuários</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                Controle perfis, acesso e redefinição de senha dos usuários cadastrados.
              </p>
            </div>
            <article className="metric-card">
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
                placeholder="Buscar por nome, e-mail ou organização"
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
                  <option value="">Todas as organizações</option>
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
                {usersMeta ? `${usersMeta.total} usuários encontrados` : "Carregando usuários..."}
              </div>
            </div>
            {users.map((user) => (
              <article key={user.id} className="data-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{user.name}</p>
                    <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                      {user.email} • {user.tenant.name}
                      {user.isPlatformAdmin ? " • Superadmin" : ""}
                    </p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Organização {user.tenant.slug} • {formatUserTenantPlanLabel(user)}
                    </p>
                    <p className="text-xs text-[var(--color-muted-foreground)]">
                      Último login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString("pt-BR") : "Nunca acessou"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                  </div>
                </div>
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
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">Convidar usuário</h2>
          <form
            className="mt-6 space-y-4"
            onSubmit={invitationForm.handleSubmit((values) => createInvitationMutation.mutate(values))}
          >
            {isPlatformAdmin ? (
              <div className="space-y-2">
                <Label htmlFor="invite-tenant">Organização</Label>
                <Select id="invite-tenant" onChange={(event) => setInviteTenantId(event.target.value)} value={inviteTenantId}>
                  <option value="">Usar primeira organização listada</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="invite-user-name">Nome</Label>
              <Input id="invite-user-name" {...invitationForm.register("name")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-user-email">E-mail</Label>
              <Input id="invite-user-email" type="email" {...invitationForm.register("email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-user-role">Perfil</Label>
              <Select id="invite-user-role" {...invitationForm.register("role")}>
                <option value="member">Membro</option>
                <option value="admin">Administrador</option>
              </Select>
            </div>
            <Button className="w-full" disabled={createInvitationMutation.isPending} type="submit">
              {createInvitationMutation.isPending ? "Criando convite..." : "Gerar convite"}
            </Button>
          </form>
        </section>

        <section className="surface content-section">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.03em]">Convites ativos e histórico</h2>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                Acompanhe convites pendentes, aceitos e revogados sem perder o link de acesso.
              </p>
            </div>
            <article className="metric-card">
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
                  <option value="">Todas as organizações</option>
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Auditoria administrativa</h2>
            <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Acompanhe alterações sensíveis em usuários, convites e organizações.
            </p>
          </div>
          <article className="metric-card">
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
                <option value="">Todas as organizações</option>
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
              <option value="user.updated">Usuários atualizados</option>
              <option value="tenant.updated">Organizações atualizadas</option>
              <option value="invitation.created">Convites criados</option>
              <option value="invitation.revoked">Convites revogados</option>
            </Select>
          </div>
          {auditItems.map((item) => (
            <article key={item.id} className="data-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{item.summary}</p>
                  <p className="break-words text-sm text-[var(--color-muted-foreground)]">
                    {item.actorUser.name} • {item.actorUser.email}
                    {item.targetTenant ? ` • ${item.targetTenant.name}` : ""}
                    {item.targetUser ? ` • ${item.targetUser.email}` : ""}
                  </p>
                </div>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {new Date(item.createdAt).toLocaleString("pt-BR")}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
