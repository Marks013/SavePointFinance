"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, RotateCw, SendHorizonal, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTimeDisplay } from "@/lib/date";

type SupportReply = {
  id: string;
  message: string;
  deliveryStatus: string;
  deliveryAttempts: number;
  providerError: string | null;
  createdAt: string;
  admin: { id: string; name: string; email: string };
};

type SupportTicket = {
  id: string;
  ticketNumber: number;
  tenant: { id: string; name: string; slug: string };
  user: { id: string; name: string; email: string };
  topicLabel: string;
  priorityLabel: string;
  subject: string;
  message: string;
  contactName: string;
  contactEmail: string;
  status: string;
  deliveryStatus: string;
  deliveryAttempts: number;
  providerError: string | null;
  expectedResponseAt: string | null;
  closedAt: string | null;
  reopenReason: string | null;
  reopenedAt: string | null;
  reopenCount: number;
  rating: number | null;
  ratingProblemResolved: boolean | null;
  ratingReason: string | null;
  ratingImprovement: string | null;
  ratedAt: string | null;
  createdAt: string;
  replies: SupportReply[];
};

type TicketsResponse = {
  items: SupportTicket[];
};

function buildQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }

  const value = search.toString();
  return value ? `?${value}` : "";
}

async function getSupportTickets(filters: { search?: string; status?: string; deliveryStatus?: string }) {
  const response = await fetch(`/api/admin/support${buildQuery(filters)}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Falha ao carregar solicitações");
  }

  return (await response.json()) as TicketsResponse;
}

async function replyTicket(ticketId: string, message: string) {
  const response = await fetch(`/api/admin/support/${ticketId}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  const payload = (await response.json().catch(() => ({}))) as { message?: string; providerError?: string | null };

  if (!response.ok) {
    throw new Error(payload.message ?? "Falha ao responder solicitação");
  }

  return payload;
}

async function retryTicket(ticketId: string) {
  const response = await fetch(`/api/admin/support/${ticketId}/resend`, {
    method: "POST"
  });
  const payload = (await response.json().catch(() => ({}))) as { message?: string; error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? "Falha ao reenviar solicitação");
  }

  return payload;
}

async function closeTicket(ticketId: string) {
  const response = await fetch(`/api/admin/support/${ticketId}/close`, {
    method: "POST"
  });
  const payload = (await response.json().catch(() => ({}))) as { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? "Falha ao encerrar solicitação");
  }

  return payload;
}

function formatTicketStatus(status: string) {
  switch (status) {
    case "answered":
      return "Respondido";
    case "closed":
      return "Encerrado";
    default:
      return "Aberto";
  }
}

function formatDeliveryStatus(status: string) {
  switch (status) {
    case "delivered":
      return "Entregue";
    case "bounced":
      return "E-mail retornou";
    case "complained":
      return "Marcado como spam";
    case "delayed":
      return "Entrega atrasada";
    case "sent":
      return "Enviado";
    case "failed":
      return "Falha no envio";
    case "not_configured":
      return "E-mail pendente";
    default:
      return "Registrado";
  }
}

export function AdminSupportClient() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [deliveryStatus, setDeliveryStatus] = useState("all");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [retryingTicketId, setRetryingTicketId] = useState<string | null>(null);
  const [closingTicketId, setClosingTicketId] = useState<string | null>(null);
  const ticketsQuery = useQuery({
    queryKey: ["admin-support", search, status, deliveryStatus],
    queryFn: () =>
      getSupportTickets({
        search: search || undefined,
        status,
        deliveryStatus
      })
  });
  const replyMutation = useMutation({
    mutationFn: ({ ticketId, message }: { ticketId: string; message: string }) => replyTicket(ticketId, message),
    onSuccess: async (payload, variables) => {
      setReplyDrafts((current) => ({ ...current, [variables.ticketId]: "" }));
      await queryClient.invalidateQueries({ queryKey: ["admin-support"] });
      if (payload.providerError) {
        toast.warning(payload.message ?? "Resposta registrada, mas a entrega falhou", {
          description: payload.providerError
        });
      } else {
        toast.success(payload.message ?? "Resposta registrada");
      }
    },
    onError: (error) => {
      toast.error("Não foi possível responder", { description: error.message });
    }
  });
  const retryMutation = useMutation({
    mutationFn: ({ ticketId }: { ticketId: string }) => {
      setRetryingTicketId(ticketId);
      return retryTicket(ticketId);
    },
    onSuccess: async (payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-support"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success(payload.message ?? "Solicitação reenviada");
    },
    onError: (error) => {
      toast.error("Reenvio não concluído", { description: error.message });
    },
    onSettled: () => {
      setRetryingTicketId(null);
    }
  });
  const closeMutation = useMutation({
    mutationFn: ({ ticketId }: { ticketId: string }) => {
      setClosingTicketId(ticketId);
      return closeTicket(ticketId);
    },
    onSuccess: async (payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-support"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-audit"] })
      ]);
      toast.success(payload.message ?? "Conversa encerrada");
    },
    onError: (error) => {
      toast.error("Não foi possível encerrar", { description: error.message });
    },
    onSettled: () => {
      setClosingTicketId(null);
    }
  });
  const tickets = ticketsQuery.data?.items ?? [];
  const openTickets = tickets.filter((ticket) => ticket.status !== "closed");
  const closedTickets = tickets.filter((ticket) => ticket.status === "closed");
  const ticketGroups = [
    { key: "open", title: "Chamados abertos", items: openTickets },
    { key: "closed", title: "Chamados encerrados", items: closedTickets }
  ];

  return (
    <div className="space-y-6">
      <section className="surface content-section">
        <div className="admin-section-header">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Suporte</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Solicitações de atendimento</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
              Acompanhe solicitações, falhas de entrega, respostas e histórico de cada conversa.
            </p>
          </div>
          <article className="metric-card admin-section-metric">
            <p className="metric-label">No recorte</p>
            <p className="metric-value">{tickets.length}</p>
          </article>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <Input placeholder="Buscar por número, assunto, e-mail, conta ou mensagem" value={search} onChange={(event) => setSearch(event.target.value)} />
          <Select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Todos os status</option>
            <option value="open">Abertos</option>
            <option value="answered">Respondidos</option>
            <option value="closed">Encerrados</option>
          </Select>
          <Select value={deliveryStatus} onChange={(event) => setDeliveryStatus(event.target.value)}>
            <option value="all">Todas as entregas</option>
            <option value="sent">Enviadas</option>
            <option value="delivered">Entregues</option>
            <option value="failed">Com falha</option>
            <option value="bounced">Retornaram</option>
            <option value="complained">Spam</option>
            <option value="not_configured">Pendentes</option>
          </Select>
        </div>
      </section>

      <section className="space-y-3">
        {ticketsQuery.isLoading ? (
          <div className="surface content-section text-sm text-[var(--color-muted-foreground)]">Carregando solicitações...</div>
        ) : tickets.length ? (
          ticketGroups.map((group) =>
            group.items.length ? (
              <div key={group.key} className="space-y-3">
                <div className="flex items-center justify-between gap-3 px-1">
                  <h2 className="text-lg font-semibold tracking-[-0.02em]">{group.title}</h2>
                  <span className="text-sm text-[var(--color-muted-foreground)]">{group.items.length}</span>
                </div>
                {group.items.map((ticket) => (
            <article key={ticket.id} className="data-card p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
                      {ticket.topicLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
                      {ticket.priorityLabel}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
                      {formatTicketStatus(ticket.status)}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
                      {formatDeliveryStatus(ticket.deliveryStatus)}
                    </span>
                  </div>
                  <h2 className="mt-3 break-words text-xl font-semibold">#{ticket.ticketNumber} • {ticket.subject}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
                    {ticket.contactName} • {ticket.contactEmail} • {ticket.tenant.name} • {formatDateTimeDisplay(ticket.createdAt)}
                    {ticket.closedAt ? ` • Encerrado em ${formatDateTimeDisplay(ticket.closedAt)}` : ""}
                  </p>
                  {ticket.reopenedAt ? (
                    <div className="mt-4 rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2">
                      <p className="text-xs font-semibold text-[var(--color-foreground)]">
                        Reaberto em {formatDateTimeDisplay(ticket.reopenedAt)}
                        {ticket.reopenCount > 1 ? ` • ${ticket.reopenCount} reaberturas` : ""}
                      </p>
                      {ticket.reopenReason ? (
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-muted-foreground)]">
                          {ticket.reopenReason}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7">{ticket.message}</p>

                  {ticket.providerError ? (
                    <p className="mt-4 rounded-[1rem] border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/8 px-3 py-2 text-sm leading-6 text-[var(--color-destructive)]">
                      Falha de entrega: {ticket.providerError}
                    </p>
                  ) : null}
                  {["failed", "not_configured", "bounced", "complained", "delayed"].includes(ticket.deliveryStatus) ? (
                    <Button
                      className="mt-4"
                      disabled={retryingTicketId === ticket.id || retryMutation.isPending}
                      onClick={() => retryMutation.mutate({ ticketId: ticket.id })}
                      type="button"
                      variant="secondary"
                    >
                      <RotateCw className="size-4" />
                      {retryingTicketId === ticket.id ? "Reenviando..." : "Reenviar para atendimento"}
                    </Button>
                  ) : null}

                  {ticket.replies.length ? (
                    <div className="mt-5 space-y-3">
                      {ticket.replies.map((reply) => (
                        <div key={reply.id} className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                          <p className="text-xs text-[var(--color-muted-foreground)]">
                            {reply.admin.name} respondeu em {formatDateTimeDisplay(reply.createdAt)} • {formatDeliveryStatus(reply.deliveryStatus)}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7">{reply.message}</p>
                          {reply.providerError ? (
                            <p className="mt-2 text-xs leading-5 text-[var(--color-destructive)]">Falha no e-mail: {reply.providerError}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {ticket.ratedAt ? (
                    <div className="mt-5 rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] p-4">
                      <p className="text-sm font-semibold">Avaliação do usuário</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[var(--color-primary)]">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <Star key={value} className={ticket.rating && ticket.rating >= value ? "size-4 fill-current" : "size-4"} />
                        ))}
                        <span className="text-sm text-[var(--color-muted-foreground)]">
                          {ticket.rating}/5 em {formatDateTimeDisplay(ticket.ratedAt)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
                        Problema resolvido: {ticket.ratingProblemResolved ? "sim" : "não"}
                      </p>
                      {ticket.ratingReason ? (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-muted-foreground)]">
                          Motivo: {ticket.ratingReason}
                        </p>
                      ) : null}
                      {ticket.ratingImprovement ? (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-muted-foreground)]">
                          Como melhorar: {ticket.ratingImprovement}
                        </p>
                      ) : null}
                    </div>
                  ) : ticket.status === "closed" ? (
                    <p className="mt-5 rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
                      Avaliação solicitada ao usuário.
                    </p>
                  ) : null}
                </div>

                <div className="w-full shrink-0 space-y-3 xl:w-[360px]">
                  {ticket.status !== "closed" ? (
                    <>
                      <Button
                        className="w-full"
                        disabled={closingTicketId === ticket.id || closeMutation.isPending}
                        onClick={() => closeMutation.mutate({ ticketId: ticket.id })}
                        type="button"
                        variant="secondary"
                      >
                        <CheckCircle2 className="size-4" />
                        {closingTicketId === ticket.id ? "Encerrando..." : "Fechar como resolvido"}
                      </Button>
                      <textarea
                        className="min-h-36 w-full rounded-[1.15rem] border border-[var(--color-border)] bg-[var(--color-input)] px-4 py-3 text-sm leading-7 outline-none transition duration-200 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/12"
                        placeholder="Escreva a resposta para o usuário"
                        value={replyDrafts[ticket.id] ?? ""}
                        onChange={(event) => setReplyDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))}
                      />
                      <Button
                        className="w-full"
                        disabled={(replyDrafts[ticket.id] ?? "").trim().length < 10 || replyMutation.isPending}
                        onClick={() => replyMutation.mutate({ ticketId: ticket.id, message: replyDrafts[ticket.id] ?? "" })}
                        type="button"
                      >
                        <SendHorizonal className="size-4" />
                        {replyMutation.isPending ? "Enviando resposta..." : "Responder"}
                      </Button>
                    </>
                  ) : (
                    <p className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
                      Conversa concluída. O campo de resposta será liberado se o usuário reabrir antes de avaliar.
                    </p>
                  )}
                </div>
              </div>
            </article>
                ))}
              </div>
            ) : null
          )
        ) : (
          <div className="surface content-section text-sm text-[var(--color-muted-foreground)]">
            Nenhuma solicitação encontrada para os filtros atuais.
          </div>
        )}
      </section>
    </div>
  );
}
