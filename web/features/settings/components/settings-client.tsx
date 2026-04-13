"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDateTimeDisplay } from "@/lib/date";
import { ensureApiResponse } from "@/lib/observability/http";

type ProfilePayload = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  isPlatformAdmin: boolean;
  tenant: {
    id?: string;
    name?: string;
  };
  sharing: {
    canManage: boolean;
  };
  whatsappNumber: string;
  license: {
    plan: "free" | "pro";
    planLabel: string;
    status: string;
    statusLabel: string;
    features: {
      whatsappAssistant: boolean;
      automation: boolean;
      pdfExport: boolean;
    };
    limits: {
      users: number | null;
      accounts: number | null;
      cards: number | null;
    };
  };
  integrations: {
    whatsappAssistantEnabled: boolean;
    whatsappConfigured: boolean;
    whatsappWebhookPath: string;
    smartClassificationEnabled: boolean;
  };
  preferences: {
    currency: string;
    dateFormat: string;
    emailNotifications: boolean;
    monthlyReports: boolean;
    budgetAlerts: boolean;
    dueReminders: boolean;
    autoTithe: boolean;
  };
};

type AutomationSummary = {
  dueSubscriptions: number;
  upcomingGoals: number;
};

type AutomationRunResult = {
  processedSubscriptions: number;
  reminders: number;
  subscriptionResults: Array<{ id: string; name: string; transactionId: string; duplicated: boolean }>;
  goalReminders: Array<{ id: string; name: string; reason: string }>;
  notificationDeliveries: Array<{ id: string; channel: string; status: string; target: string }>;
};

type NotificationListPayload = {
  items: Array<{
    id: string;
    channel: string;
    status: string;
    target: string;
    subject: string;
    message: string;
    errorMessage?: string | null;
    attemptedAt?: string | null;
    deliveredAt?: string | null;
    goal?: { id: string; name: string } | null;
  }>;
};

type SettingsFormValues = {
  name: string;
  whatsappNumber: string;
  currency: string;
  dateFormat: string;
  emailNotifications: boolean;
  monthlyReports: boolean;
  budgetAlerts: boolean;
  dueReminders: boolean;
  autoTithe: boolean;
};

function formatNotificationStatus(status: string) {
  switch (status) {
    case "sent":
      return "Entregue";
    case "failed":
      return "Falhou";
    case "pending":
      return "Pendente";
    case "skipped":
      return "Ignorado";
    default:
      return status;
  }
}

function formatChannel(channel: string) {
  switch (channel) {
    case "email":
      return "E-mail";
    case "whatsapp":
      return "WhatsApp";
    default:
      return channel;
  }
}

function formatBrazilWhatsAppInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (!digits.length) {
    return "";
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  if (digits.length <= 3) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
}

async function getProfile() {
  const response = await fetch("/api/profile", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar perfil", method: "GET", path: "/api/profile" });
  return (await response.json()) as ProfilePayload;
}

async function getAutomationSummary() {
  const response = await fetch("/api/automation", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar automacoes", method: "GET", path: "/api/automation" });
  if (!response.ok) throw new Error("Falha ao carregar automações");
  return (await response.json()) as AutomationSummary;
}

async function getNotifications() {
  const response = await fetch("/api/notifications", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar notificacoes", method: "GET", path: "/api/notifications" });
  if (!response.ok) throw new Error("Falha ao carregar notificações");
  return (await response.json()) as NotificationListPayload;
}

export function SettingsClient() {
  const queryClient = useQueryClient();
  const [automationResult, setAutomationResult] = useState<AutomationRunResult | null>(null);
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const automationEnabled = Boolean(profileQuery.data?.license.features.automation);
  const whatsappEnabledForPlan = Boolean(profileQuery.data?.license.features.whatsappAssistant);
  const automationQuery = useQuery({
    queryKey: ["automation-summary"],
    queryFn: getAutomationSummary,
    enabled: automationEnabled
  });
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotifications,
    enabled: automationEnabled
  });
  const notifications = notificationsQuery.data?.items ?? [];
  const deliveredNotifications = notifications.filter((item) => item.status === "sent").length;
  const failedNotifications = notifications.filter((item) => item.status === "failed").length;
  const canManageSharing = Boolean(profileQuery.data?.sharing.canManage);
  const form = useForm<SettingsFormValues>({
    defaultValues: {
      name: "",
      whatsappNumber: "",
      currency: "BRL",
      dateFormat: "DD/MM/YYYY",
      emailNotifications: true,
      monthlyReports: true,
      budgetAlerts: true,
      dueReminders: true,
      autoTithe: false
    },
    values: profileQuery.data
      ? {
          name: profileQuery.data.name,
          whatsappNumber: profileQuery.data.whatsappNumber,
          currency: profileQuery.data.preferences.currency,
          dateFormat: profileQuery.data.preferences.dateFormat,
          emailNotifications: profileQuery.data.preferences.emailNotifications,
          monthlyReports: profileQuery.data.preferences.monthlyReports,
          budgetAlerts: profileQuery.data.preferences.budgetAlerts,
          dueReminders: profileQuery.data.preferences.dueReminders,
          autoTithe: profileQuery.data.preferences.autoTithe
        }
      : undefined
  });

  const profileMutation = useMutation({
    mutationFn: async (values: SettingsFormValues) => {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          whatsappNumber: values.whatsappNumber,
          preferences: {
            currency: values.currency,
            dateFormat: values.dateFormat,
            emailNotifications: values.emailNotifications,
            monthlyReports: values.monthlyReports,
            budgetAlerts: values.budgetAlerts,
            dueReminders: values.dueReminders,
            autoTithe: values.autoTithe
          }
        })
      });
      await ensureApiResponse(response, { fallbackMessage: "Falha ao salvar configuracoes", method: "PATCH", path: "/api/profile" });

      if (!response.ok) throw new Error("Falha ao salvar configurações");
    },
    onSuccess: async () => {
      toast.success("Configurações salvas");
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: () => {
      toast.error("Não foi possível salvar configurações");
    }
  });

  const automationMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/automation", {
        method: "POST"
      });
      await ensureApiResponse(response, { fallbackMessage: "Falha ao executar automacoes", method: "POST", path: "/api/automation" });

      if (!response.ok) throw new Error("Falha ao executar automações");
      return (await response.json()) as AutomationRunResult;
    },
    onSuccess: async (payload) => {
      setAutomationResult(payload);
      toast.success("Automações executadas");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["automation-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["subscriptions"] }),
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["reports-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        queryClient.invalidateQueries({ queryKey: ["accounts"] }),
        queryClient.invalidateQueries({ queryKey: ["cards"] }),
        queryClient.invalidateQueries({ queryKey: ["goals"] })
      ]);
    },
    onError: () => {
      toast.error("Não foi possível executar automações");
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/profile", {
        method: "DELETE"
      });
      await ensureApiResponse(response, { fallbackMessage: "Nao foi possivel excluir a conta", method: "DELETE", path: "/api/profile" });

      const payload = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Não foi possível excluir a conta");
      }
    },
    onSuccess: async () => {
      toast.success("Conta excluída definitivamente");
      await signOut({ redirect: false });
      window.location.href = "/";
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  return (
    <div className="space-y-6">
      {canManageSharing ? (
        <section className="surface content-section">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="eyebrow">Convidar parentes</div>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Compartilhamento familiar</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
                Convide cônjuge, familiar ou alguém de confiança para usar a mesma carteira financeira da conta{" "}
                {profileQuery.data?.tenant.name ?? "principal"}.
              </p>
            </div>
            <Button asChild className="w-full sm:w-auto">
              <Link href="/dashboard/sharing">Abrir convites</Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section className="surface content-section">
        <div className="page-intro">
          <div className="eyebrow">Configurações</div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">Perfil, preferências e rotina</h1>
          <p className="max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
            Esta área centraliza preferências pessoais, lembretes recorrentes e os sinais operacionais do seu dia a dia.
          </p>
        </div>
        {profileQuery.data?.isPlatformAdmin ? (
          <div className="warning-panel mt-6 text-sm">
            Esta conta é o superadmin da plataforma. Recursos Premium e limites do plano ficam liberados aqui para
            suporte e auditoria, mesmo que a conta vinculada esteja em um plano restritivo.
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="surface content-section">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">Perfil e preferências</h2>
          <form className="mt-6 space-y-4" onSubmit={form.handleSubmit((values) => profileMutation.mutate(values))}>
            <div className="space-y-2">
              <Label htmlFor="settings-name">Nome</Label>
              <Input id="settings-name" {...form.register("name")} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="settings-email">E-mail</Label>
                <Input disabled id="settings-email" value={profileQuery.data?.email ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-whatsapp">WhatsApp</Label>
                <Input
                  id="settings-whatsapp"
                  inputMode="numeric"
                  placeholder="(DD) 9 0000-0000"
                  value={form.watch("whatsappNumber")}
                  onChange={(event) =>
                    form.setValue("whatsappNumber", formatBrazilWhatsAppInput(event.target.value), {
                      shouldDirty: true,
                      shouldTouch: true
                    })
                  }
                />
                <p className="attention-copy text-xs">
                  Use o numero que sera vinculado ao assistente no WhatsApp.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="settings-currency">Moeda</Label>
                <Select id="settings-currency" {...form.register("currency")}>
                  <option value="BRL">BRL</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="settings-date-format">Formato de data</Label>
                <Select id="settings-date-format" {...form.register("dateFormat")}>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="muted-panel flex items-center gap-3 text-sm"><input className="app-checkbox" type="checkbox" {...form.register("emailNotifications")} /> Notificações por e-mail</label>
              <label className="muted-panel flex items-center gap-3 text-sm"><input className="app-checkbox" type="checkbox" {...form.register("monthlyReports")} /> Relatórios mensais</label>
              <label className="muted-panel flex items-center gap-3 text-sm"><input className="app-checkbox" type="checkbox" {...form.register("budgetAlerts")} /> Alertas de orçamento</label>
              <label className="muted-panel flex items-center gap-3 text-sm"><input className="app-checkbox" type="checkbox" {...form.register("dueReminders")} /> Lembretes de vencimento</label>
              <label className="muted-panel flex items-center gap-3 text-sm"><input className="app-checkbox" type="checkbox" {...form.register("autoTithe")} /> Marcar dízimo por padrão em novas receitas</label>
            </div>
            <Button className="w-full" disabled={profileMutation.isPending} type="submit">
              {profileMutation.isPending ? "Salvando..." : "Salvar configurações"}
            </Button>
          </form>
        </section>

        <section className="surface content-section">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">Automações recorrentes</h2>
          {automationEnabled ? (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <article className="metric-card">
                  <p className="text-sm text-[var(--color-muted-foreground)]">Assinaturas vencidas</p>
                  <p className="mt-2 text-2xl font-semibold">{automationQuery.data?.dueSubscriptions ?? 0}</p>
                </article>
                <article className="metric-card">
                  <p className="text-sm text-[var(--color-muted-foreground)]">Metas com prazo próximo</p>
                  <p className="mt-2 text-2xl font-semibold">{automationQuery.data?.upcomingGoals ?? 0}</p>
                </article>
              </div>
              <Button className="mt-6 w-full" disabled={automationMutation.isPending} onClick={() => automationMutation.mutate()} type="button">
                {automationMutation.isPending ? "Executando..." : "Executar automações agora"}
              </Button>

              {automationResult ? (
                <div className="muted-panel mt-6 text-sm">
                  <p className="break-words"><strong>Transações geradas:</strong> {automationResult.processedSubscriptions}</p>
                  <p className="break-words"><strong>Lembretes emitidos:</strong> {automationResult.reminders}</p>
                  {automationResult.subscriptionResults.length > 0 ? (
                    <p className="mt-3 break-words text-[var(--color-muted-foreground)]">
                      Assinaturas processadas: {automationResult.subscriptionResults.map((item) => item.name).join(", ")}
                    </p>
                  ) : null}
                  {automationResult.goalReminders.length > 0 ? (
                    <p className="mt-2 break-words text-[var(--color-muted-foreground)]">
                      Metas lembradas: {automationResult.goalReminders.map((item) => item.name).join(", ")}
                    </p>
                  ) : null}
                  {automationResult.notificationDeliveries.length > 0 ? (
                    <p className="mt-2 break-words text-[var(--color-muted-foreground)]">
                      Entregas:{" "}
                      {automationResult.notificationDeliveries
                        .map((item) => `${item.channel}:${item.status}`)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <div className="warning-panel mt-6 text-sm">
              O plano {profileQuery.data?.license.planLabel ?? "atual"} não inclui automações recorrentes. Faça upgrade
              para liberar geração automática de lançamentos e lembretes.
            </div>
          )}
        </section>
      </div>

      <section className="surface content-section">
        <div className="eyebrow">WhatsApp</div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Assistente virtual</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Vincule o seu número para lançar receitas, despesas e consultar saldo, limite e fatura por mensagem. O
          número salvo no perfil será usado para identificar apenas a sua conta.
        </p>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="data-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Status da integração</p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  {!whatsappEnabledForPlan
                    ? "Disponível apenas no plano Premium."
                    : profileQuery.data?.integrations.whatsappAssistantEnabled
                      ? "Assistente habilitado no ambiente."
                      : "Assistente ainda desabilitado no ambiente."}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
                  {whatsappEnabledForPlan
                    ? profileQuery.data?.integrations.whatsappAssistantEnabled
                      ? "Ativo"
                      : "Desativado"
                    : "Plano bloqueado"}
                </span>
                <span className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
                  {whatsappEnabledForPlan
                    ? profileQuery.data?.integrations.whatsappConfigured
                      ? "Webhook configurado"
                      : "Webhook pendente"
                    : "Upgrade necessário"}
                </span>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="muted-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  Número vinculado
                </p>
                <p className="mt-2 break-words text-sm">
                  {profileQuery.data?.whatsappNumber || "Cadastre um número no formato (DD) 9 0000-0000"}
                </p>
              </div>
              <div className="muted-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  Endpoint
                </p>
                <p className="mt-2 break-all text-sm">
                  {whatsappEnabledForPlan ? profileQuery.data?.integrations.whatsappWebhookPath : "Recurso indisponível no plano atual"}
                </p>
              </div>
              <div className="muted-panel md:col-span-2">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
                  Classificação inteligente
                </p>
                <p className="mt-2 break-words text-sm">
                  {profileQuery.data?.integrations.smartClassificationEnabled
                    ? "Ativa para interpretar descrições e ajudar na categoria dos lançamentos."
                    : "Desativada no ambiente. O sistema usa apenas regras locais e memória do histórico."}
                </p>
              </div>
            </div>
          </article>
          <article className="data-card p-5">
            <p className="text-sm font-semibold">Exemplos de comando</p>
            <div className="mt-4 space-y-2 text-sm text-[var(--color-muted-foreground)]">
              <p className="break-words">`gastei 42,50 mercado na Nubank`</p>
              <p className="break-words">`gastei 120 farmácia no cartão Visa 3x`</p>
              <p className="break-words">`recebi 3200 salário no Itaú`</p>
              <p className="break-words">`saldo`</p>
              <p className="break-words">`fatura Visa`</p>
              <p className="break-words">`limite Mastercard`</p>
            </div>
          </article>
        </div>
      </section>

      <section className="surface content-section">
        <div className="eyebrow">Notificações</div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Entregas recentes</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Os lembretes gerados pelas automações ficam registrados aqui com status de entrega por canal.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="metric-card">
            <p className="metric-label">Registradas</p>
            <p className="metric-value">{notifications.length}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Entregues</p>
            <p className="metric-value">{deliveredNotifications}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Falhas</p>
            <p className="metric-value">{failedNotifications}</p>
          </article>
        </div>
        <div className="mt-6 space-y-3">
          {notifications.map((item) => (
            <article key={item.id} className="data-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold">{item.subject}</p>
                  <p className="mt-1 break-words text-sm text-[var(--color-muted-foreground)]">
                    {formatChannel(item.channel)} • {formatNotificationStatus(item.status)} • {item.target}
                  </p>
                  {item.goal ? (
                    <p className="mt-1 break-words text-sm text-[var(--color-muted-foreground)]">Meta relacionada: {item.goal.name}</p>
                  ) : null}
                </div>
                <p className="w-full break-words text-sm text-[var(--color-muted-foreground)] sm:w-auto sm:text-right">
                  {item.deliveredAt
                    ? formatDateTimeDisplay(item.deliveredAt)
                    : item.attemptedAt
                      ? formatDateTimeDisplay(item.attemptedAt)
                      : "Pendente"}
                </p>
              </div>
              <p className="mt-3 break-words text-sm text-[var(--color-muted-foreground)]">{item.message}</p>
              {item.errorMessage ? (
                <p className="mt-2 break-words text-sm text-[var(--color-muted-foreground)]">Erro: {item.errorMessage}</p>
              ) : null}
            </article>
          ))}
          {notifications.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">
              Nenhuma notificação registrada ainda. Execute a rotina automática para gerar novos avisos.
            </p>
          ) : null}
        </div>
      </section>

      <section className="surface content-section">
        <div className="eyebrow">Zona de risco</div>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Excluir conta definitivamente</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Esta ação apaga o seu login e todos os dados vinculados à sua conta, incluindo contas, cartões,
          transações, metas, assinaturas e histórico próprio.
        </p>
        {profileQuery.data?.isPlatformAdmin ? (
          <div className="warning-panel mt-6 text-sm">
            A conta superadmin da plataforma não pode ser excluída por este fluxo.
          </div>
        ) : (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button
              className="border-[var(--color-destructive)] text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)]"
              disabled={deleteAccountMutation.isPending}
              onClick={() => {
                const email = profileQuery.data?.email ?? "";
                const confirmation = window.prompt(`Digite ${email} para confirmar a exclusão definitiva da conta.`);

                if (!confirmation) {
                  return;
                }

                if (confirmation.trim().toLowerCase() !== email.trim().toLowerCase()) {
                  toast.error("O e-mail informado não confere");
                  return;
                }

                deleteAccountMutation.mutate();
              }}
              type="button"
              variant="ghost"
            >
              {deleteAccountMutation.isPending ? "Excluindo conta..." : "Excluir minha conta"}
            </Button>
          </div>
        )}
      </section>

    </div>
  );
}
