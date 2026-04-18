"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageCircleMore, ReceiptText, Route, Settings2, Sparkles, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ensureApiResponse } from "@/lib/observability/http";

type WhatsAppProfilePayload = {
  whatsappNumber: string;
  license: {
    planLabel: string;
    features: {
      whatsappAssistant: boolean;
    };
  };
  integrations: {
    whatsappAssistantEnabled: boolean;
    whatsappConfigured: boolean;
    whatsappWebhookPath: string;
    smartClassificationEnabled: boolean;
    whatsappIssue: string | null;
  };
};

async function getProfile() {
  const response = await fetch("/api/profile", { cache: "no-store" });
  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao carregar configuracoes do WhatsApp",
    method: "GET",
    path: "/api/profile"
  });

  return (await response.json()) as WhatsAppProfilePayload;
}

const commandExamples = [
  "gastei 42,50 no mercado na conta Inter",
  "gastei 120 na farmácia no cartão Nubank 3x",
  "recebi 3200 de salário no Itaú",
  "saldo",
  "fatura PicPay",
  "limite Nubank"
];

const guidance = [
  "Diga o valor e o contexto principal da compra ou da entrada.",
  "Se houver conta ou cartão, cite o nome exatamente como aparece no app.",
  "Se for parcelado, termine a frase com 2x, 3x ou 10x.",
  "Evite misturar duas compras na mesma mensagem."
];

export function WhatsAppClient() {
  const profileQuery = useQuery({
    queryKey: ["profile", "whatsapp-hub"],
    queryFn: getProfile,
    staleTime: 30_000
  });

  const profile = profileQuery.data;
  const whatsappEnabledForPlan = Boolean(profile?.license.features.whatsappAssistant);
  const assistantEnabled = Boolean(profile?.integrations.whatsappAssistantEnabled);
  const webhookConfigured = Boolean(profile?.integrations.whatsappConfigured);

  return (
    <div className="space-y-6">
      <section className="surface content-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">WhatsApp</div>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">Central do assistente</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
              O WhatsApp é o atalho mais rápido do SavePoint para lançar gastos, consultar saldo, olhar cartão e manter
              o financeiro em dia sem sair da conversa.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="/dashboard/settings">Abrir configurações</Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/transactions">Ver transações</Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="metric-card">
            <p className="metric-label">Plano</p>
            <p className="metric-value">{profile?.license.planLabel ?? "Carregando..."}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Assistente</p>
            <p className="metric-value">
              {!whatsappEnabledForPlan ? "Bloqueado" : assistantEnabled ? "Ativo" : "Desativado"}
            </p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Webhook</p>
            <p className="metric-value">{webhookConfigured ? "Pronto" : "Pendente"}</p>
          </article>
          <article className="metric-card">
            <p className="metric-label">Número vinculado</p>
            <p className="metric-value text-lg">{profile?.whatsappNumber || "Não informado"}</p>
          </article>
        </div>

        {!webhookConfigured && profile?.integrations.whatsappIssue ? (
          <div className="warning-panel mt-6 text-sm">{profile.integrations.whatsappIssue}</div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="surface content-section">
          <div className="flex items-center gap-3">
            <MessageCircleMore className="size-5 text-[var(--color-primary)]" />
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Comandos que funcionam melhor</h2>
          </div>
          <div className="mt-6 space-y-3">
            {commandExamples.map((command) => (
              <article key={command} className="data-card px-4 py-3">
                <p className="break-words text-sm text-[var(--color-foreground)]">`{command}`</p>
              </article>
            ))}
          </div>
        </section>

        <section className="surface content-section">
          <div className="flex items-center gap-3">
            <Sparkles className="size-5 text-[var(--color-primary)]" />
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Como deixar a leitura melhor</h2>
          </div>
          <div className="mt-6 space-y-3">
            {guidance.map((item) => (
              <article key={item} className="muted-panel text-sm leading-7 text-[var(--color-muted-foreground)]">
                {item}
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="surface content-section">
          <div className="flex items-center gap-3">
            <Route className="size-5 text-[var(--color-primary)]" />
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Fluxo recomendado</h2>
          </div>
          <div className="mt-6 grid gap-3">
            <article className="data-card p-4">
              <p className="text-sm font-semibold">1. Cadastre seu número</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                O número salvo no perfil identifica somente a sua carteira.
              </p>
            </article>
            <article className="data-card p-4">
              <p className="text-sm font-semibold">2. Lance com contexto</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                Valor, conta ou cartão e uma descrição simples já bastam para o SavePoint entender melhor.
              </p>
            </article>
            <article className="data-card p-4">
              <p className="text-sm font-semibold">3. Valide só quando precisar</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                As classificações automáticas aparecem em Transações apenas para refinar categoria, não para criar o
                lançamento do zero.
              </p>
            </article>
          </div>
        </section>

        <section className="surface content-section">
          <div className="flex items-center gap-3">
            <Wallet className="size-5 text-[var(--color-primary)]" />
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Memória da categorização</h2>
          </div>
          <div className="mt-6 space-y-4">
            <div className="muted-panel">
              <p className="text-sm leading-7 text-[var(--color-muted-foreground)]">
                O aprendizado automático de categoria é reaproveitado por carteira, não de forma global entre todos os
                usuários da plataforma. Isso protege o contexto de cada operação e evita contaminação entre contas.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <article className="data-card p-4">
                <p className="text-sm font-semibold">Regras manuais</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                  Quando você revisa uma sugestão, o sistema fortalece uma regra local da sua carteira.
                </p>
              </article>
              <article className="data-card p-4">
                <p className="text-sm font-semibold">IA com memória local</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                  Quando a confiança é alta, a IA aprende atalhos reutilizáveis para a mesma carteira.
                </p>
              </article>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/dashboard/settings">
                  <Settings2 className="size-4" />
                  Ajustar integração
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard/transactions">
                  <ReceiptText className="size-4" />
                  Validar classificações
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
