"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type PopupCampaignItem = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  kind: "announcement" | "update" | "welcome";
  tone: "calm" | "success" | "spotlight" | "warning";
  eyebrow: string | null;
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  dismissLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  priority: number;
  delayMs: number;
  autoHideMs: number | null;
  dismissible: boolean;
  oncePerUser: boolean;
  maxViews: number | null;
  showToNewUsers: boolean;
  showToReturningUsers: boolean;
  showToPlatformAdmins: boolean;
  showToTenantAdmins: boolean;
  showToMembers: boolean;
  uniqueViews: number;
  createdAt: string;
  updatedAt: string;
};

type PopupCampaignDraft = {
  name: string;
  status: PopupCampaignItem["status"];
  kind: PopupCampaignItem["kind"];
  tone: PopupCampaignItem["tone"];
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  dismissLabel: string;
  startsAt: string;
  endsAt: string;
  priority: string;
  delayMs: string;
  autoHideMs: string;
  dismissible: boolean;
  oncePerUser: boolean;
  maxViews: string;
  showToNewUsers: boolean;
  showToReturningUsers: boolean;
  showToPlatformAdmins: boolean;
  showToTenantAdmins: boolean;
  showToMembers: boolean;
};

const defaultDraft: PopupCampaignDraft = {
  name: "",
  status: "draft",
  kind: "announcement",
  tone: "calm",
  eyebrow: "",
  title: "",
  body: "",
  ctaLabel: "",
  ctaUrl: "",
  dismissLabel: "Agora não",
  startsAt: "",
  endsAt: "",
  priority: "100",
  delayMs: "1.2",
  autoHideMs: "",
  dismissible: true,
  oncePerUser: true,
  maxViews: "",
  showToNewUsers: true,
  showToReturningUsers: true,
  showToPlatformAdmins: false,
  showToTenantAdmins: true,
  showToMembers: true
};

const kindOptions = {
  announcement: {
    label: "Aviso",
    helper: "Comunicados curtos, manutenção ou lembretes importantes.",
    tone: "calm" as const,
    eyebrow: "Aviso rápido"
  },
  update: {
    label: "Atualização",
    helper: "Novidades de produto, melhorias e lançamentos.",
    tone: "spotlight" as const,
    eyebrow: "Novidade no ar"
  },
  welcome: {
    label: "Boas-vindas",
    helper: "Recepção leve para novos usuários após o primeiro login.",
    tone: "success" as const,
    eyebrow: "Primeiros passos"
  }
};

const popupTemplates: Array<{
  kind: PopupCampaignItem["kind"];
  label: string;
  description: string;
  draft: Partial<PopupCampaignDraft>;
}> = [
  {
    kind: "welcome",
    label: "Boas-vindas",
    description: "Receba novos usuários com orientação clara.",
    draft: {
      name: "Boas-vindas para novos usuários",
      kind: "welcome",
      tone: "success",
      eyebrow: "Primeiros passos",
      title: "Bem-vindo ao Save Point Finance.",
      body: "Seu painel já está pronto. Comece cadastrando suas contas, metas e cartões para acompanhar sua vida financeira com mais tranquilidade.",
      ctaLabel: "Começar agora",
      ctaUrl: "/dashboard",
      showToNewUsers: true,
      showToReturningUsers: false
    }
  },
  {
    kind: "update",
    label: "Atualização",
    description: "Comunique melhorias sem parecer recado genérico.",
    draft: {
      name: "Atualização do produto",
      kind: "update",
      tone: "spotlight",
      eyebrow: "Novidade no ar",
      title: "Novidades chegaram ao seu painel.",
      body: "Melhoramos alguns pontos do Save Point Finance para deixar sua organização financeira mais simples, clara e rápida.",
      ctaLabel: "Conhecer novidades",
      ctaUrl: "/dashboard"
    }
  },
  {
    kind: "announcement",
    label: "Aviso",
    description: "Use para manutenção, lembretes e alertas operacionais.",
    draft: {
      name: "Aviso importante",
      kind: "announcement",
      tone: "calm",
      eyebrow: "Aviso rápido",
      title: "Temos um recado importante para você.",
      body: "Queremos te manter por dentro sem atrapalhar sua rotina. Leia este aviso e siga normalmente pelo painel.",
      ctaLabel: "Ver detalhes",
      ctaUrl: "/dashboard"
    }
  }
];

function toDateInput(value: string | null) {
  return value ? value.slice(0, 16) : "";
}

function buildDraftFromCampaign(item: PopupCampaignItem): PopupCampaignDraft {
  return {
    name: item.name,
    status: item.status,
    kind: item.kind,
    tone: item.tone,
    eyebrow: item.eyebrow ?? "",
    title: item.title,
    body: item.body,
    ctaLabel: item.ctaLabel ?? "",
    ctaUrl: item.ctaUrl ?? "",
    dismissLabel: item.dismissLabel,
    startsAt: toDateInput(item.startsAt),
    endsAt: toDateInput(item.endsAt),
    priority: String(item.priority),
    delayMs: String(item.delayMs / 1000),
    autoHideMs: item.autoHideMs ? String(item.autoHideMs / 1000) : "",
    dismissible: item.dismissible,
    oncePerUser: item.oncePerUser,
    maxViews: item.maxViews ? String(item.maxViews) : "",
    showToNewUsers: item.showToNewUsers,
    showToReturningUsers: item.showToReturningUsers,
    showToPlatformAdmins: item.showToPlatformAdmins,
    showToTenantAdmins: item.showToTenantAdmins,
    showToMembers: item.showToMembers
  };
}

async function getPopupCampaigns() {
  const response = await fetch("/api/admin/popup-campaigns", { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as { items?: PopupCampaignItem[]; message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? "Falha ao carregar campanhas de popup.");
  }

  return payload.items ?? [];
}

function numberOrDefault(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: string) {
  const parsed = Number(value);
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

function serializeDraft(draft: PopupCampaignDraft) {
  const autoHideSeconds = optionalNumber(draft.autoHideMs);
  const delaySeconds = numberOrDefault(draft.delayMs, 1.2);
  const maxViews = optionalNumber(draft.maxViews);

  return {
    ...draft,
    name: draft.name.trim(),
    eyebrow: draft.eyebrow.trim() || null,
    title: draft.title.trim(),
    body: draft.body.trim(),
    ctaLabel: draft.ctaLabel.trim() || null,
    ctaUrl: draft.ctaUrl.trim() || null,
    dismissLabel: draft.dismissLabel.trim() || "Agora não",
    priority: numberOrDefault(draft.priority, 100),
    delayMs: Math.min(Math.max(Math.round(delaySeconds * 1000), 0), 30000),
    autoHideMs: autoHideSeconds && autoHideSeconds >= 3 ? Math.min(Math.round(autoHideSeconds * 1000), 60000) : null,
    maxViews: maxViews && maxViews > 0 ? Math.min(maxViews, 999) : null,
    startsAt: draft.startsAt ? new Date(draft.startsAt).toISOString() : null,
    endsAt: draft.endsAt ? new Date(draft.endsAt).toISOString() : null
  };
}

function statusLabel(status: PopupCampaignItem["status"]) {
  if (status === "active") return "Ativa";
  if (status === "paused") return "Pausada";
  if (status === "archived") return "Arquivada";
  return "Rascunho";
}

function validateDraft(draft: PopupCampaignDraft) {
  if (!draft.name.trim()) return "Informe um nome interno.";
  if (draft.title.trim().length < 3) return "Informe um título claro.";
  if (draft.body.trim().length < 12) return "Escreva uma mensagem com pelo menos 12 caracteres.";
  if (draft.ctaLabel.trim() && !draft.ctaUrl.trim()) return "Informe o link do botão principal.";
  return null;
}

export function PopupCampaignManager() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PopupCampaignDraft>(defaultDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const campaignsQuery = useQuery({
    queryKey: ["admin-popup-campaigns"],
    queryFn: getPopupCampaigns
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validationMessage = validateDraft(draft);

      if (validationMessage) {
        throw new Error(validationMessage);
      }

      const response = await fetch(
        editingId ? `/api/admin/popup-campaigns/${editingId}` : "/api/admin/popup-campaigns",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(serializeDraft(draft))
        }
      );
      const payload = (await response.json().catch(() => ({}))) as { message?: string; item?: PopupCampaignItem };

      if (!response.ok) {
        throw new Error(payload.message ?? "Não foi possível salvar este popup. Revise os campos destacados e tente novamente.");
      }

      return payload;
    },
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-popup-campaigns"] });
      toast.success(payload.message ?? "Campanha salva com sucesso.");
      setEditingId(null);
      setDraft(defaultDraft);
    },
    onError: (error) => toast.error(error.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/admin/popup-campaigns/${id}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { message?: string };

      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao excluir campanha de popup.");
      }

      return payload;
    },
    onSuccess: async (payload, id) => {
      await queryClient.invalidateQueries({ queryKey: ["admin-popup-campaigns"] });
      toast.success(payload.message ?? "Campanha removida.");
      if (editingId === id) {
        setEditingId(null);
        setDraft(defaultDraft);
      }
    },
    onError: (error) => toast.error(error.message)
  });

  function updateDraft<K extends keyof PopupCampaignDraft>(key: K, value: PopupCampaignDraft[K]) {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  }

  function updateKind(kind: PopupCampaignItem["kind"]) {
    setDraft((current) => ({
      ...current,
      kind,
      tone: kindOptions[kind].tone,
      eyebrow: current.eyebrow || kindOptions[kind].eyebrow,
      showToNewUsers: kind === "welcome" ? true : current.showToNewUsers,
      showToReturningUsers: kind === "welcome" ? false : current.showToReturningUsers,
      oncePerUser: true
    }));
  }

  function applyTemplate(template: (typeof popupTemplates)[number]) {
    setEditingId(null);
    setDraft((current) => ({
      ...current,
      ...template.draft,
      status: "draft",
      dismissLabel: current.dismissLabel || "Agora não"
    }));
  }

  function updateBooleanDraft(
    key:
      | "dismissible"
      | "oncePerUser"
      | "showToNewUsers"
      | "showToReturningUsers"
      | "showToPlatformAdmins"
      | "showToTenantAdmins"
      | "showToMembers",
    value: boolean
  ) {
    setDraft((current) => ({
      ...current,
      [key]: value
    }));
  }

  const campaigns = campaignsQuery.data ?? [];
  const activeCampaigns = campaigns.filter((item) => item.status === "active").length;
  const selectedKind = kindOptions[draft.kind];

  return (
    <section className="surface content-section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Popup de login
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Avisos leves para depois do login</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
            Crie mensagens rápidas de boas-vindas, manutenção ou novidades. O básico fica à vista; público, recorrência
            e tempo ficam nas configurações avançadas.
          </p>
        </div>
        <article className="w-full min-w-[14rem] rounded-[1.6rem] border border-[var(--color-border)] bg-[var(--color-card)] px-5 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] sm:w-auto">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">Campanhas</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-[var(--color-foreground)]">{campaigns.length}</p>
          <p className="mt-1 whitespace-nowrap text-xs text-[var(--color-muted-foreground)]">
            {activeCampaigns} {activeCampaigns === 1 ? "ativa agora" : "ativas agora"}
          </p>
        </article>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {popupTemplates.map((template) => (
          <button
            key={template.kind}
            className="rounded-[1.35rem] border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--color-primary)] hover:shadow-[0_16px_42px_rgba(15,23,42,0.08)]"
            onClick={() => applyTemplate(template)}
            type="button"
          >
            <p className="text-sm font-semibold">Usar modelo: {template.label}</p>
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">{template.description}</p>
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <details className="admin-disclosure" open={Boolean(editingId)}>
          <summary className="admin-disclosure-summary">
            <div>
              <p className="admin-disclosure-kicker">Composição</p>
              <p className="admin-disclosure-title">{editingId ? "Editando campanha" : "Nova campanha"}</p>
            </div>
            <p className="admin-disclosure-copy">{selectedKind.helper}</p>
          </summary>
          <div className="admin-disclosure-body">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[var(--color-muted-foreground)]">
                O formulário fica recolhido por padrão para priorizar campanhas ativas e a prévia.
              </p>
              <Button
                onClick={() => {
                  setEditingId(null);
                  setDraft(defaultDraft);
                }}
                type="button"
                variant="ghost"
              >
                Limpar
              </Button>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="popup-kind">Assunto</Label>
                <Select id="popup-kind" value={draft.kind} onChange={(event) => updateKind(event.target.value as PopupCampaignItem["kind"])}>
                  <option value="announcement">Aviso</option>
                  <option value="update">Atualização</option>
                  <option value="welcome">Boas-vindas</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="popup-status">Status</Label>
                <Select id="popup-status" value={draft.status} onChange={(event) => updateDraft("status", event.target.value as PopupCampaignItem["status"])}>
                  <option value="draft">Rascunho</option>
                  <option value="active">Ativa</option>
                  <option value="paused">Pausada</option>
                  <option value="archived">Arquivada</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="popup-name">Nome interno</Label>
                <Input id="popup-name" placeholder="Ex.: boas-vindas maio" value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[0.7fr_1.3fr]">
              <div className="space-y-2">
                <Label htmlFor="popup-eyebrow">Etiqueta</Label>
                <Input id="popup-eyebrow" placeholder={selectedKind.eyebrow} value={draft.eyebrow} onChange={(event) => updateDraft("eyebrow", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="popup-title">Título</Label>
                <Input id="popup-title" placeholder="Ex.: Bem-vindo ao seu painel" value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} />
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="popup-body">Mensagem</Label>
              <textarea
                id="popup-body"
                className="min-h-28 w-full rounded-[1.25rem] border border-[var(--color-border)] bg-[var(--color-input)] px-4 py-3 text-sm text-[var(--color-foreground)] outline-none transition duration-200 focus:border-[var(--color-primary)] focus:bg-[var(--color-card)] focus:ring-4 focus:ring-[var(--color-ring)]/12"
                placeholder="Escreva um recado curto, útil e simpático. Evite textos longos."
                value={draft.body}
                onChange={(event) => updateDraft("body", event.target.value)}
              />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="popup-cta-label">Botão principal</Label>
                <Input id="popup-cta-label" placeholder="Opcional. Ex.: Ver novidade" value={draft.ctaLabel} onChange={(event) => updateDraft("ctaLabel", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="popup-cta-url">Link do botão</Label>
                <Input id="popup-cta-url" placeholder="/dashboard" value={draft.ctaUrl} onChange={(event) => updateDraft("ctaUrl", event.target.value)} />
              </div>
            </div>

            <details className="admin-disclosure mt-5">
              <summary className="admin-disclosure-summary">
                <div>
                  <p className="admin-disclosure-kicker">Segmentação</p>
                  <p className="admin-disclosure-title">Configurações avançadas</p>
                </div>
                <p className="admin-disclosure-copy">Público, frequência, datas, prioridade e regras de exibição.</p>
              </summary>
              <div className="admin-disclosure-body">
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label htmlFor="popup-tone">Visual</Label>
                <Select id="popup-tone" value={draft.tone} onChange={(event) => updateDraft("tone", event.target.value as PopupCampaignItem["tone"])}>
                  <option value="calm">Calmo</option>
                  <option value="success">Positivo</option>
                  <option value="spotlight">Destaque</option>
                  <option value="warning">Atenção</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="popup-delay">Atraso para abrir</Label>
                <Input id="popup-delay" type="number" min="0" max="30" step="0.1" value={draft.delayMs} onChange={(event) => updateDraft("delayMs", event.target.value)} />
                <p className="text-xs text-[var(--color-muted-foreground)]">Em segundos. Ex.: 1.5 para abrir após um segundo e meio.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="popup-autohide">Auto-fechar</Label>
                <Input id="popup-autohide" type="number" min="3" max="60" step="1" placeholder="Nunca" value={draft.autoHideMs} onChange={(event) => updateDraft("autoHideMs", event.target.value)} />
                <p className="text-xs text-[var(--color-muted-foreground)]">Em segundos. Deixe vazio para não fechar sozinho.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="popup-priority">Prioridade</Label>
                <Input id="popup-priority" type="number" min="0" max="999" value={draft.priority} onChange={(event) => updateDraft("priority", event.target.value)} />
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="popup-starts-at">Inicia em</Label>
                <Input id="popup-starts-at" type="datetime-local" value={draft.startsAt} onChange={(event) => updateDraft("startsAt", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="popup-ends-at">Termina em</Label>
                <Input id="popup-ends-at" type="datetime-local" value={draft.endsAt} onChange={(event) => updateDraft("endsAt", event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="popup-max-views">Limite por usuário</Label>
                <Input id="popup-max-views" type="number" min="1" max="999" placeholder="Sem limite" value={draft.maxViews} onChange={(event) => updateDraft("maxViews", event.target.value)} />
              </div>
            </div>

            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
              {[
                ["dismissible", "Usuário pode fechar"],
                ["oncePerUser", "Mostrar só uma vez"],
                ["showToNewUsers", "Novos usuários"],
                ["showToReturningUsers", "Usuários recorrentes"],
                ["showToPlatformAdmins", "Superadmin"],
                ["showToTenantAdmins", "Administradores da conta"],
                ["showToMembers", "Membros e familiares"]
              ].map(([key, label]) => (
                <label key={key} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--color-card)] px-3 py-2">
                  <span>{label}</span>
                  <input
                    className="h-4 w-4 accent-[var(--color-primary)]"
                    type="checkbox"
                    checked={draft[key as keyof PopupCampaignDraft] as boolean}
                    onChange={(event) =>
                      updateBooleanDraft(
                        key as
                          | "dismissible"
                          | "oncePerUser"
                          | "showToNewUsers"
                          | "showToReturningUsers"
                          | "showToPlatformAdmins"
                          | "showToTenantAdmins"
                          | "showToMembers",
                        event.target.checked
                      )
                    }
                  />
                </label>
              ))}
            </div>
              </div>
            </details>

            <div className="mt-5 flex flex-wrap gap-3">
              <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()} type="button">
                {saveMutation.isPending ? "Salvando..." : editingId ? "Salvar campanha" : "Criar campanha"}
              </Button>
            </div>
          </div>
        </details>

        <div className="space-y-3">
          <article className="rounded-[1.8rem] border border-[var(--color-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-card)_92%,#f7fbff),var(--color-card))] p-5 shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
              {draft.eyebrow || selectedKind.eyebrow}
            </p>
            <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em]">{draft.title || "Título do aviso"}</h3>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted-foreground)]">
              {draft.body || "A prévia aparece aqui enquanto você escreve."}
            </p>
            {draft.ctaLabel ? (
              <div className="mt-4">
                <span className="inline-flex rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white">
                  {draft.ctaLabel}
                </span>
              </div>
            ) : null}
          </article>

          {campaigns.map((item) => (
            <article key={item.id} className="data-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.name}</p>
                  <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                    {statusLabel(item.status)} - {kindOptions[item.kind].label} - {item.uniqueViews} visualizações
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--color-muted-foreground)]">{item.title}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => {
                      setEditingId(item.id);
                      setDraft(buildDraftFromCampaign(item));
                    }}
                    type="button"
                    variant="secondary"
                  >
                    Editar
                  </Button>
                  <Button disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(item.id)} type="button" variant="ghost">
                    Excluir
                  </Button>
                </div>
              </div>
            </article>
          ))}

          {campaignsQuery.isLoading ? (
            <article className="data-card p-4 text-sm text-[var(--color-muted-foreground)]">Carregando campanhas...</article>
          ) : null}
        </div>
      </div>
    </section>
  );
}
