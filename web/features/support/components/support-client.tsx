"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, CheckCircle2, Clock3, MailCheck, SendHorizonal } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
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
import { ensureApiResponse } from "@/lib/observability/http";

type SupportClientProps = {
  initialEmail: string;
  initialName: string;
};

type SupportResponse = {
  id?: string;
  message?: string;
};

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

export function SupportClient({ initialEmail, initialName }: SupportClientProps) {
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
    onSuccess: () => {
      toast.success("Mensagem enviada ao suporte");
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

  return (
    <div className="grid gap-6 2xl:grid-cols-[0.95fr_1.05fr]">
      <section className="surface content-section">
        <div className="eyebrow">Suporte</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Fale com o suporte</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted-foreground)]">
          Envie uma solicitação com o contexto certo para acelerar a triagem. O formulário encaminha sua mensagem por
          e-mail transacional via Resend.
        </p>

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
              A mensagem é enviada pelo backend com Resend, sem expor token no navegador, e já chega com assunto,
              prioridade e dados de contato organizados.
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
                  <p className="font-semibold">Triagem por prioridade</p>
                  <p className="mt-1 text-sm leading-6 text-[var(--color-muted-foreground)]">
                    A prioridade e o assunto ajudam a separar financeiro, técnico e uso do produto.
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
    </div>
  );
}
