"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageCircleMore, ReceiptText, Route, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ensureApiResponse } from "@/lib/observability/http";

type WhatsAppProfilePayload = {
  name: string;
  whatsappNumber: string;
  permissions: {
    canEditWhatsAppNumber: boolean;
  };
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

function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function WhatsAppClient() {
  const queryClient = useQueryClient();
  const [whatsappNumberDraft, setWhatsAppNumberDraft] = useState<string | null>(null);
  const profileQuery = useQuery({
    queryKey: ["profile", "whatsapp-hub"],
    queryFn: getProfile,
    staleTime: 30_000
  });

  const profile = profileQuery.data;
  const whatsappEnabledForPlan = Boolean(profile?.license.features.whatsappAssistant);
  const assistantEnabled = Boolean(profile?.integrations.whatsappAssistantEnabled);
  const webhookConfigured = Boolean(profile?.integrations.whatsappConfigured);
  const canEditWhatsAppNumber = Boolean(profile?.permissions.canEditWhatsAppNumber);
  const whatsappNumber = whatsappNumberDraft ?? profile?.whatsappNumber ?? "";
  const savedWhatsAppNumber = profile?.whatsappNumber ?? "";
  const hasWhatsAppChange = normalizePhoneDigits(whatsappNumber) !== normalizePhoneDigits(savedWhatsAppNumber);
  const hasSavedWhatsAppNumber = Boolean(normalizePhoneDigits(savedWhatsAppNumber));

  const whatsappMutation = useMutation({
    mutationFn: async () => {
      if (!profile) {
        return;
      }

      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          whatsappNumber,
          preferences: profile.preferences
        })
      });

      await ensureApiResponse(response, {
        fallbackMessage: "Falha ao salvar WhatsApp",
        method: "PATCH",
        path: "/api/profile"
      });
    },
    onSuccess: async () => {
      toast.success("WhatsApp atualizado");
      setWhatsAppNumberDraft(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["profile"] }),
        queryClient.invalidateQueries({ queryKey: ["profile", "whatsapp-hub"] })
      ]);
    },
    onError: (error) => toast.error(error.message)
  });

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
            <Button asChild>
              <Link href="/dashboard/transactions">Ver transações</Link>
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article className="metric-card motion-card">
            <p className="metric-label">Plano</p>
            <p className="metric-value">{profile?.license.planLabel ?? "Carregando..."}</p>
          </article>
          <article className="metric-card motion-card">
            <p className="metric-label">Assistente</p>
            <p className="metric-value">
              {!whatsappEnabledForPlan ? "Bloqueado" : assistantEnabled ? "Ativo" : "Desativado"}
            </p>
          </article>
          <article className="metric-card motion-card">
            <p className="metric-label">Webhook</p>
            <p className="metric-value">{webhookConfigured ? "Pronto" : "Pendente"}</p>
          </article>
          <article className="metric-card motion-card">
            <p className="metric-label">Número vinculado</p>
            <p className="metric-value text-lg">{profile?.whatsappNumber || "Não informado"}</p>
          </article>
        </div>

        {!webhookConfigured && profile?.integrations.whatsappIssue ? (
          <div className="warning-panel mt-6 text-sm">{profile.integrations.whatsappIssue}</div>
        ) : null}
      </section>

      <section className="surface content-section">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="eyebrow">Configuracao</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Numero e integracao</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--color-muted-foreground)]">
              Cadastre aqui o numero que identifica sua conta nas mensagens do assistente.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <article className="data-card p-5">
            <div className="space-y-2">
              <Label htmlFor="whatsapp-number">WhatsApp</Label>
              <Input
                disabled={!canEditWhatsAppNumber || whatsappMutation.isPending}
                id="whatsapp-number"
                inputMode="numeric"
                placeholder="(DD) 9 0000-0000"
                value={whatsappNumber}
                onChange={(event) => setWhatsAppNumberDraft(formatBrazilWhatsAppInput(event.target.value))}
              />
            </div>
            <Button
              className="mt-4 w-full"
              disabled={!canEditWhatsAppNumber || whatsappMutation.isPending || !hasWhatsAppChange}
              onClick={() => whatsappMutation.mutate()}
              type="button"
              variant={hasWhatsAppChange ? "default" : "secondary"}
            >
              {whatsappMutation.isPending ? (
                "Salvando..."
              ) : hasWhatsAppChange ? (
                "Salvar WhatsApp"
              ) : hasSavedWhatsAppNumber ? (
                <>
                  <CheckCircle2 className="size-4" />
                  WhatsApp salvo
                </>
              ) : (
                "Informe um WhatsApp"
              )}
            </Button>
          </article>
          <article className="data-card p-5">
            <p className="text-sm font-semibold">Status da integracao</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="muted-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Endpoint</p>
                <p className="mt-2 break-all text-sm">
                  {whatsappEnabledForPlan ? profile?.integrations.whatsappWebhookPath : "Recurso indisponivel no plano atual"}
                </p>
              </div>
              <div className="muted-panel">
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Leitura inteligente</p>
                <p className="mt-2 break-words text-sm">
                  {profile?.integrations.smartClassificationEnabled ? "Ativa" : "Desativada"}
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="surface content-section">
          <div className="flex items-center gap-3">
            <MessageCircleMore className="size-5 text-[var(--color-primary)]" />
            <h2 className="text-2xl font-semibold tracking-[-0.03em]">Comandos que funcionam melhor</h2>
          </div>
          <div className="mt-6 space-y-3">
            {commandExamples.map((command) => (
              <article key={command} className="data-card motion-card px-4 py-3">
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
            <article className="data-card motion-card p-4">
              <p className="text-sm font-semibold">1. Cadastre seu número</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                O número salvo no perfil identifica somente a sua carteira.
              </p>
            </article>
            <article className="data-card motion-card p-4">
              <p className="text-sm font-semibold">2. Lance com contexto</p>
              <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                Valor, conta ou cartão e uma descrição simples já bastam para o SavePoint entender melhor.
              </p>
            </article>
            <article className="data-card motion-card p-4">
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
                Sugestões confiáveis da IA que você aceita podem fortalecer a memória global da plataforma. Ajustes
                manuais ou alterações feitas por uma carteira continuam locais, preservando o contexto de cada família.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <article className="data-card motion-card p-4">
                <p className="text-sm font-semibold">Regras manuais</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                  Quando você troca a categoria sugerida, o sistema fortalece uma regra local da sua carteira.
                </p>
              </article>
              <article className="data-card motion-card p-4">
                <p className="text-sm font-semibold">IA com memória global</p>
                <p className="mt-2 text-sm leading-7 text-[var(--color-muted-foreground)]">
                  Quando você mantém uma sugestão confiável, ela pode ajudar outras carteiras com categorias equivalentes.
                </p>
              </article>
            </div>
            <div className="danger-panel">
              <p className="danger-kicker">Acesso seguro</p>
              <p className="danger-copy">
                Os atalhos desta central levam apenas para a configuração do WhatsApp e validação de transações. Convites
                familiares continuam isolados na área própria e obedecem às permissões do titular.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
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
