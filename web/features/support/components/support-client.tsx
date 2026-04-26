"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Clock3, History, MailCheck, SendHorizonal, Star } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  supportPriorityLabels,
  supportPriorityValues,
  supportRequestSchema,
  supportTopicLabels,
  supportTopicValues,
  type SupportRequestValues
} from "@/features/support/schemas/support-schema";
import { formatDateTimeDisplay } from "@/lib/date";
import { ensureApiResponse } from "@/lib/observability/http";

type SupportClientProps = {
  initialEmail: string;
  initialName: string;
};

type SupportResponse = {
  id?: string;
  deliveryStatus?: string;
  expectedResponseAt?: string;
  responseWindow?: string;
  message?: string;
};

type SupportTicketItem = {
  id: string;
  topicLabel: string;
  priorityLabel: string;
  subject: string;
  message: string;
  messagePreview: string;
  status: string;
  deliveryStatus: string;
  expectedResponseAt: string | null;
  closedAt: string | null;
  rating: number | null;
  ratingProblemResolved: boolean | null;
  ratingReason: string | null;
  ratingImprovement: string | null;
  ratedAt: string | null;
  createdAt: string;
  updatedAt: string;
  replies: Array<{
    id: string;
    message: string;
    deliveryStatus: string;
    createdAt: string;
  }>;
};

type SupportHistoryResponse = {
  responseWindow: string;
  items: SupportTicketItem[];
};

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

async function submitSupportRequest(values: SupportRequestValues) {
  const response = await fetch("/api/support", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });
  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao enviar solicitação de suporte",
    method: "POST",
    path: "/api/support"
  });

  const payload = (await response.json()) as SupportResponse;

  if (!response.ok) {
    throw new Error(payload.message ?? "Não foi possível enviar a mensagem");
  }

  return payload;
}

async function getSupportHistory() {
  const response = await fetch("/api/support?limit=5", { cache: "no-store" });
  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao carregar histórico de suporte",
    method: "GET",
    path: "/api/support"
  });

  return (await response.json()) as SupportHistoryResponse;
}

async function rateSupportTicket(
  ticketId: string,
  values: { rating: number; problemResolved: boolean; reason?: string; improvement?: string }
) {
  const response = await fetch(`/api/support/${ticketId}/rating`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(values)
  });
  const payload = (await response.json().catch(() => ({}))) as { message?: string };

  if (!response.ok) {
    throw new Error(payload.message ?? "Não foi possível registrar a avaliação");
  }

  return payload;
}

export function SupportClient({ initialEmail, initialName }: SupportClientProps) {
  const queryClient = useQueryClient();
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, { rating: number; problemResolved: boolean; reason: string; improvement: string }>>({});
  const form = useForm<z.input<typeof supportRequestSchema>, unknown, SupportRequestValues>({
    resolver: zodResolver(supportRequestSchema),
    defaultValues: {
      topic: "technical",
      priority: "normal",
      subject: "",
      message: "",
      contactEmail: initialEmail,
      contactName: initialName,
      allowAccountContext: true
    }
  });

  const mutation = useMutation({
    mutationFn: submitSupportRequest,
    onSuccess: (payload) => {
      if (payload.deliveryStatus === "failed" || payload.deliveryStatus === "not_configured") {
        toast.warning("Solicitação registrada", {
          description: payload.message ?? "Nossa equipe verá a pendência para acompanhar."
        });
      } else {
        toast.success("Mensagem enviada ao suporte", {
          description: payload.responseWindow ?? "Resposta em até 24 horas em dias úteis."
        });
      }
      queryClient.invalidateQueries({ queryKey: ["support-history"] });
      form.reset({
        topic: "technical",
        priority: "normal",
        subject: "",
        message: "",
        contactEmail: initialEmail,
        contactName: initialName,
        allowAccountContext: true
      });
    },
    onError: (error) => {
      toast.error("Não foi possível enviar", {
        description: error.message
      });
    }
  });
  const historyQuery = useQuery({
    queryKey: ["support-history"],
    queryFn: getSupportHistory
  });
  const ratingMutation = useMutation({
    mutationFn: ({ ticketId, values }: { ticketId: string; values: { rating: number; problemResolved: boolean; reason?: string; improvement?: string } }) =>
      rateSupportTicket(ticketId, values),
    onSuccess: async (payload) => {
      await queryClient.invalidateQueries({ queryKey: ["support-history"] });
      toast.success(payload.message ?? "Avaliação registrada");
    },
    onError: (error) => {
      toast.error("Avaliação não registrada", { description: error.message });
    }
  });
  const responseWindow =
    historyQuery.data?.responseWindow ??
    "Respondemos em até 24 horas em dias úteis. Mensagens abertas em domingos ou feriados entram no próximo dia útil.";

  return (
    <div className="grid gap-6 2xl:grid-cols-[0.95fr_1.05fr]">
      <section className="surface content-section">
        <div className="eyebrow">Suporte</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Fale com o suporte</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Envie sua solicitação com as informações principais para nossa equipe acompanhar e responder com clareza.
        </p>
        <div className="mt-5 rounded-[1.15rem] border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 text-sm leading-6 text-[var(--color-muted-foreground)]">
          {responseWindow}
        </div>

        <form className="mt-8 space-y-5" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="support-topic">Assunto</Label>
              <Select id="support-topic" {...form.register("topic")}>
                {supportTopicValues.map((topic) => (
                  <option key={topic} value={topic}>
                    {supportTopicLabels[topic]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-priority">Prioridade</Label>
              <Select id="support-priority" {...form.register("priority")}>
                {supportPriorityValues.map((priority) => (
                  <option key={priority} value={priority}>
                    {supportPriorityLabels[priority]}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="support-name">Nome para contato</Label>
              <Input id="support-name" {...form.register("contactName")} />
              {form.formState.errors.contactName ? (
                <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.contactName.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-email">E-mail de retorno</Label>
              <Input id="support-email" type="email" {...form.register("contactEmail")} />
              {form.formState.errors.contactEmail ? (
                <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.contactEmail.message}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-subject">Resumo</Label>
            <Input id="support-subject" placeholder="Ex.: Fatura do cartão não bate com o fechamento" {...form.register("subject")} />
            {form.formState.errors.subject ? (
              <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.subject.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="support-message">Mensagem</Label>
            <textarea
              className="min-h-44 w-full rounded-[1.15rem] border border-[var(--color-border)] bg-[var(--color-input)] px-4 py-3 text-sm leading-7 text-[var(--color-foreground)] outline-none transition duration-200 placeholder:text-[var(--color-muted-foreground)] focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/12"
              id="support-message"
              placeholder="Conte o que você estava tentando fazer, o que aconteceu e qual resultado esperava."
              {...form.register("message")}
            />
            {form.formState.errors.message ? (
              <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.message.message}</p>
            ) : null}
          </div>

          <label className="muted-panel flex items-start gap-3 text-sm leading-6">
            <input className="app-checkbox mt-1" type="checkbox" {...form.register("allowAccountContext")} />
            <span>
              Incluir dados básicos da sessão, como conta, usuário, plano e página de origem, para ajudar na análise.
            </span>
          </label>

          <Button className="w-full" disabled={mutation.isPending} type="submit">
            <SendHorizonal className="size-4" />
            {mutation.isPending ? "Enviando..." : "Enviar solicitação"}
          </Button>
        </form>
      </section>

      <section className="surface content-section">
        <div className="grid gap-4">
          <article className="surface-strong rounded-[30px] p-6 text-white">
            <p className="metric-label text-white/70">Canal oficial</p>
            <h2 className="mt-3 text-2xl font-semibold">Atendimento por e-mail transacional</h2>
            <p className="mt-3 text-sm leading-7 text-white/78">
              Sua solicitação chega organizada para atendimento, com assunto, prioridade e dados de contato.
            </p>
          </article>

          <div className="grid gap-3">
            <article className="metric-card">
              <div className="flex items-start gap-3">
                <MailCheck className="mt-1 size-5 text-[var(--color-primary)]" />
                <div>
                  <p className="font-semibold">Resposta direta</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-muted-foreground)]">
                    O e-mail informado é usado como resposta da conversa.
                  </p>
                </div>
              </div>
            </article>
            <article className="metric-card">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-1 size-5 text-[var(--color-primary)]" />
                <div>
                  <p className="font-semibold">Prazo de retorno</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-muted-foreground)]">
                    Até 24 horas em dias úteis; domingos e feriados ficam para o próximo dia útil.
                  </p>
                </div>
              </div>
            </article>
            <article className="metric-card">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 size-5 text-[var(--color-primary)]" />
                <div>
                  <p className="font-semibold">Contexto controlado</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-muted-foreground)]">
                    Você decide se quer incluir dados básicos da conta na solicitação.
                  </p>
                </div>
              </div>
            </article>
          </div>

          {mutation.isError ? (
            <div className="rounded-[1.15rem] border border-[var(--color-destructive)]/20 bg-[var(--color-destructive)]/8 p-4 text-sm text-[var(--color-destructive)]">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 size-4" />
                <p>{mutation.error.message}</p>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="surface content-section 2xl:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow">Histórico</div>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">Últimas solicitações</h2>
          </div>
          <span className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1 text-xs text-[var(--color-muted-foreground)]">
            Máximo de 5 registros
          </span>
        </div>

        <div className="mt-5 grid gap-3">
          {historyQuery.isLoading ? (
            <div className="muted-panel text-sm text-[var(--color-muted-foreground)]">Carregando histórico...</div>
          ) : historyQuery.data?.items.length ? (
            historyQuery.data.items.map((ticket) => (
              <article key={ticket.id} className="metric-card">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
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
                    </div>
                    <p className="mt-3 break-words font-semibold">{ticket.subject}</p>
                    <div className="mt-3 rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2">
                      <p className="text-xs font-semibold text-[var(--color-foreground)]">Sua mensagem</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-muted-foreground)]">
                        {ticket.message}
                      </p>
                    </div>
                    {ticket.replies.length ? (
                      <div className="mt-3 space-y-2">
                        {ticket.replies.map((reply) => (
                          <div key={reply.id} className="rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2">
                            <p className="text-xs font-semibold text-[var(--color-foreground)]">
                              Resposta do suporte em {formatDateTimeDisplay(reply.createdAt)}
                            </p>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-muted-foreground)]">
                              {reply.message}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {ticket.status === "closed" && !ticket.ratedAt ? (
                      <div className="mt-4 rounded-[1rem] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_92%,var(--color-muted))] p-4">
                        <p className="text-sm font-semibold">Essa conversa resolveu seu problema?</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[1, 2, 3, 4, 5].map((value) => {
                            const draft = ratingDrafts[ticket.id] ?? { rating: 0, problemResolved: true, reason: "", improvement: "" };
                            const selected = draft.rating >= value;

                            return (
                              <button
                                key={value}
                                aria-label={`Avaliar com ${value} estrela${value > 1 ? "s" : ""}`}
                                className="rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] p-2 text-[var(--color-primary)] transition hover:-translate-y-0.5"
                                type="button"
                                onClick={() =>
                                  setRatingDrafts((current) => ({
                                    ...current,
                                    [ticket.id]: { ...(current[ticket.id] ?? { problemResolved: true, reason: "", improvement: "" }), rating: value }
                                  }))
                                }
                              >
                                <Star className={selected ? "size-5 fill-current" : "size-5"} />
                              </button>
                            );
                          })}
                        </div>
                        <label className="mt-4 flex items-start gap-3 text-sm leading-6">
                          <input
                            className="app-checkbox mt-1"
                            checked={ratingDrafts[ticket.id]?.problemResolved ?? true}
                            type="checkbox"
                            onChange={(event) =>
                              setRatingDrafts((current) => ({
                                ...current,
                                [ticket.id]: {
                                  ...(current[ticket.id] ?? { rating: 0, reason: "", improvement: "" }),
                                  problemResolved: event.target.checked
                                }
                              }))
                            }
                          />
                          <span>Sim, meu problema foi resolvido.</span>
                        </label>
                        {(ratingDrafts[ticket.id]?.rating ?? 0) > 0 && (ratingDrafts[ticket.id]?.rating ?? 0) < 4 ? (
                          <div className="mt-3 space-y-2">
                            <Label htmlFor={`rating-${ticket.id}-reason`}>O que faltou no atendimento?</Label>
                            <textarea
                              className="min-h-24 w-full rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-sm leading-6 outline-none transition duration-200 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/12"
                              id={`rating-${ticket.id}-reason`}
                              value={ratingDrafts[ticket.id]?.reason ?? ""}
                              onChange={(event) =>
                                setRatingDrafts((current) => ({
                                  ...current,
                                  [ticket.id]: {
                                    ...(current[ticket.id] ?? { rating: 0, problemResolved: true, improvement: "" }),
                                    reason: event.target.value
                                  }
                                }))
                              }
                            />
                          </div>
                        ) : null}
                        <div className="mt-3 space-y-2">
                          <Label htmlFor={`rating-${ticket.id}-improvement`}>Como podemos melhorar?</Label>
                          <textarea
                            className="min-h-24 w-full rounded-[1rem] border border-[var(--color-border)] bg-[var(--color-input)] px-3 py-2 text-sm leading-6 outline-none transition duration-200 focus:border-[var(--color-primary)] focus:ring-4 focus:ring-[var(--color-primary)]/12"
                            id={`rating-${ticket.id}-improvement`}
                            value={ratingDrafts[ticket.id]?.improvement ?? ""}
                            onChange={(event) =>
                              setRatingDrafts((current) => ({
                                ...current,
                                [ticket.id]: {
                                  ...(current[ticket.id] ?? { rating: 0, problemResolved: true, reason: "" }),
                                  improvement: event.target.value
                                }
                              }))
                            }
                          />
                        </div>
                        <Button
                          className="mt-3"
                          disabled={
                            ratingMutation.isPending ||
                            !ratingDrafts[ticket.id]?.rating ||
                            ((ratingDrafts[ticket.id]?.rating ?? 0) < 4 && (ratingDrafts[ticket.id]?.reason ?? "").trim().length < 10)
                          }
                          type="button"
                          onClick={() => {
                            const draft = ratingDrafts[ticket.id];
                            if (!draft) return;
                            ratingMutation.mutate({
                              ticketId: ticket.id,
                              values: {
                                rating: draft.rating,
                                problemResolved: draft.problemResolved,
                                reason: draft.reason,
                                improvement: draft.improvement
                              }
                            });
                          }}
                        >
                          Enviar avaliação
                        </Button>
                      </div>
                    ) : null}
                    {ticket.ratedAt ? (
                      <p className="mt-3 text-sm leading-6 text-[var(--color-muted-foreground)]">
                        Avaliação registrada: {ticket.rating} estrela{ticket.rating === 1 ? "" : "s"}.
                      </p>
                    ) : null}
                  </div>
                  <div className="min-w-48 text-sm leading-6 text-[var(--color-muted-foreground)]">
                    <p>{formatDateTimeDisplay(ticket.createdAt)}</p>
                    <p>{formatDeliveryStatus(ticket.deliveryStatus)}</p>
                    {ticket.expectedResponseAt ? <p>Previsão: {formatDateTimeDisplay(ticket.expectedResponseAt)}</p> : null}
                    {ticket.closedAt ? <p>Encerrado: {formatDateTimeDisplay(ticket.closedAt)}</p> : null}
                  </div>
                </div>
              </article>
            ))
          ) : (
            <div className="muted-panel flex items-start gap-3 text-sm leading-6 text-[var(--color-muted-foreground)]">
              <History className="mt-0.5 size-4 text-[var(--color-primary)]" />
              <p>Nenhuma solicitação registrada ainda. Quando você enviar uma mensagem, ela aparecerá aqui.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
