"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invitationSchema } from "@/features/password/schemas/password-schema";
import { formatDateDisplay } from "@/lib/date";
import { ensureApiResponse } from "@/lib/observability/http";

type SharingProfile = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  isPlatformAdmin: boolean;
  tenant: {
    id?: string;
    name?: string;
  };
  license: {
    planLabel: string;
  };
};

type SharingMember = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  isActive: boolean;
  createdAt: string;
  lastLogin: string | null;
};

type SharingInvitation = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  inviteUrl: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

type SharingState = {
  canManage: boolean;
  owner: {
    id: string;
    name: string;
    email: string;
  } | null;
  members: SharingMember[];
  invitations: SharingInvitation[];
};

type SharingInviteValues = {
  name: string;
  email: string;
};

type SharingInviteResponse = {
  inviteUrl: string;
  emailDelivery?: {
    status: "pending" | "sent" | "failed" | "skipped";
    errorMessage: string | null;
    attemptedAt: string | null;
  };
};

const sharingInviteSchema = invitationSchema.pick({
  name: true,
  email: true
});

async function getProfile() {
  const response = await fetch("/api/profile", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar perfil", method: "GET", path: "/api/profile" });

  return (await response.json()) as SharingProfile;
}

async function getSharingState() {
  const response = await fetch("/api/sharing", { cache: "no-store" });
  await ensureApiResponse(response, { fallbackMessage: "Falha ao carregar compartilhamento", method: "GET", path: "/api/sharing" });

  return (await response.json()) as SharingState;
}

function toAbsoluteInviteUrl(inviteUrl: string) {
  if (typeof window === "undefined") {
    return inviteUrl;
  }

  return new URL(inviteUrl, window.location.origin).toString();
}

function invitationStatusLabel(invitation: SharingInvitation) {
  if (invitation.acceptedAt) {
    return "Aceito";
  }

  if (invitation.revokedAt) {
    return "Revogado";
  }

  return "Pendente";
}

export function SharingClient() {
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: getProfile, staleTime: 30_000 });
  const sharingQuery = useQuery({ queryKey: ["sharing-state"], queryFn: getSharingState, staleTime: 15_000 });
  const form = useForm<z.input<typeof sharingInviteSchema>, unknown, SharingInviteValues>({
    resolver: zodResolver(sharingInviteSchema),
    defaultValues: {
      name: "",
      email: ""
    }
  });

  const owner = sharingQuery.data?.owner ?? null;
  const members = sharingQuery.data?.members ?? [];
  const invitations = sharingQuery.data?.invitations ?? [];
  const activeMembers = members.filter((member) => member.isActive);
  const activeInvitation = invitations.find((item) => !item.acceptedAt && !item.revokedAt);
  const canManage = Boolean(sharingQuery.data?.canManage);

  const createInvitationMutation = useMutation({
    mutationFn: async (values: SharingInviteValues) => {
      const response = await fetch("/api/sharing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      await ensureApiResponse(response, { fallbackMessage: "Falha ao criar convite", method: "POST", path: "/api/sharing" });
      const payload = (await response.json()) as SharingInviteResponse & { message?: string };

      return payload;
    },
    onSuccess: async (payload) => {
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ["sharing-state"] });
      const inviteUrl = toAbsoluteInviteUrl(payload.inviteUrl);
      toast.success(
        payload.emailDelivery?.status === "sent" ? "Convite enviado por e-mail" : "Convite criado",
        {
          description: inviteUrl
        }
      );
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await fetch("/api/sharing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId })
      });
      await ensureApiResponse(response, { fallbackMessage: "Falha ao revogar convite", method: "DELETE", path: "/api/sharing" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sharing-state"] });
      toast.success("Convite revogado");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const revokeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const response = await fetch("/api/sharing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId })
      });
      await ensureApiResponse(response, { fallbackMessage: "Falha ao revogar acesso", method: "DELETE", path: "/api/sharing" });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["sharing-state"] });
      toast.success("Acesso revogado");
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  return (
    <div className="space-y-6">
      <section className="surface content-section">
        <div className="eyebrow">Convidar parentes</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Compartilhamento familiar</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Este espaço é exclusivo para dividir a mesma carteira financeira com uma única pessoa da família. O controle
          fica com o titular da conta e o convidado não pode reenviar convites nem administrar acessos.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <article className="metric-card">
            <p className="metric-label">Titular da conta</p>
            <p className="metric-value">{owner?.name ?? profileQuery.data?.name ?? "Conta principal"}</p>
            <p className="metric-footnote">{profileQuery.data?.tenant.name ?? "Carteira principal"}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Convidado atual</p>
            <p className="metric-value">{activeMembers[0]?.name ?? "Nenhum"}</p>
            <p className="metric-footnote">
              {activeInvitation ? "Existe um convite pendente" : "Somente 1 pessoa pode compartilhar"}
            </p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Plano da carteira</p>
            <p className="metric-value">Sem limite</p>
            <p className="metric-footnote">{profileQuery.data?.license.planLabel ?? "Plano atual"}</p>
          </article>
        </div>
      </section>

      {!canManage ? (
        <section className="surface content-section">
          <div className="warning-panel text-sm">
            Somente o titular convidado pelo administrador da plataforma pode gerenciar o compartilhamento familiar desta
            carteira.
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="surface content-section">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">Convidar familiar ou cônjuge</h2>
          <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
            O compartilhamento permite apenas 1 convidado por vez. Para trocar a pessoa, primeiro revogue o acesso atual
            ou o convite pendente.
          </p>
          <form
            className="mt-6 space-y-4"
            onSubmit={form.handleSubmit(
              (values) => createInvitationMutation.mutate(values),
              (errors) => {
                const firstError = errors.name?.message || errors.email?.message;
                toast.error(firstError ?? "Revise os dados do convite");
              }
            )}
          >
            <div className="space-y-2">
              <Label htmlFor="sharing-family-name">Nome</Label>
              <Input
                disabled={!canManage || Boolean(activeMembers[0]) || Boolean(activeInvitation)}
                id="sharing-family-name"
                placeholder="Ex.: Ana Silva"
                {...form.register("name")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sharing-family-email">E-mail</Label>
              <Input
                disabled={!canManage || Boolean(activeMembers[0]) || Boolean(activeInvitation)}
                id="sharing-family-email"
                placeholder="ana@email.com"
                type="email"
                {...form.register("email")}
              />
            </div>
            <div className="muted-panel text-sm text-[var(--color-muted-foreground)]">
              A pessoa convidada entra sempre como membro da carteira compartilhada e não pode gerenciar convites.
            </div>
            <Button
              className="w-full"
              disabled={!canManage || Boolean(activeMembers[0]) || Boolean(activeInvitation) || createInvitationMutation.isPending}
              type="submit"
            >
              {createInvitationMutation.isPending ? "Enviando convite..." : "Enviar convite"}
            </Button>
          </form>
        </section>

        <section className="surface content-section">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">Pessoa compartilhando a carteira</h2>
          <div className="mt-6 space-y-3">
            {members.map((member) => (
              <article key={member.id} className="data-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{member.name}</p>
                    <p className="mt-1 break-words text-sm text-[var(--color-muted-foreground)]">{member.email}</p>
                    <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                      {member.lastLogin
                        ? `Último acesso em ${formatDateDisplay(member.lastLogin)}`
                        : "Ainda sem acesso registrado"}
                    </p>
                  </div>
                  <div className="w-full sm:w-auto sm:text-right">
                    <p className="text-sm font-semibold text-[var(--color-foreground)]">
                      {member.isActive ? "Ativo" : "Revogado"}
                    </p>
                    {member.isActive && canManage ? (
                      <Button
                        className="mt-3"
                        disabled={revokeMemberMutation.isPending}
                        onClick={() => revokeMemberMutation.mutate(member.id)}
                        type="button"
                        variant="ghost"
                      >
                        Revogar acesso
                      </Button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
            {!sharingQuery.isLoading && members.length === 0 ? (
              <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
                Nenhuma pessoa adicional está compartilhando esta carteira neste momento.
              </div>
            ) : null}
          </div>
        </section>
      </div>

      <section className="surface content-section">
        <h2 className="text-2xl font-semibold tracking-[-0.03em]">Convite atual e histórico</h2>
        <div className="mt-6 space-y-3">
          {invitations.map((invitation) => {
            const inviteUrl = toAbsoluteInviteUrl(invitation.inviteUrl);

            return (
              <article key={invitation.id} className="data-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-semibold">{invitation.name}</p>
                    <p className="mt-1 break-words text-sm text-[var(--color-muted-foreground)]">{invitation.email}</p>
                    <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
                      Expira em {formatDateDisplay(invitation.expiresAt)}
                    </p>
                  </div>
                  <div className="w-full sm:w-auto sm:text-right">
                    <p className="text-sm font-semibold text-[var(--color-foreground)]">
                      {invitationStatusLabel(invitation)}
                    </p>
                    <div className="mt-2 flex flex-wrap justify-end gap-3 text-xs">
                      <a className="font-medium text-[var(--color-primary)]" href={inviteUrl} rel="noreferrer" target="_blank">
                        Abrir link
                      </a>
                      <button
                        className="font-medium text-[var(--color-primary)]"
                        onClick={async () => {
                          await navigator.clipboard.writeText(inviteUrl);
                          toast.success("Link copiado");
                        }}
                        type="button"
                      >
                        Copiar
                      </button>
                      {!invitation.acceptedAt && !invitation.revokedAt && canManage ? (
                        <button
                          className="font-medium text-[var(--color-coral-500)]"
                          onClick={() => revokeInvitationMutation.mutate(invitation.id)}
                          type="button"
                        >
                          Revogar
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {!sharingQuery.isLoading && invitations.length === 0 ? (
            <div className="muted-panel border border-dashed px-4 py-6 text-sm text-[var(--color-muted-foreground)]">
              Nenhum convite de compartilhamento foi gerado ainda.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
