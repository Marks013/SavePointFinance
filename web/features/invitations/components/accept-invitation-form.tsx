"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvitationSchema, type AcceptInvitationValues } from "@/features/password/schemas/password-schema";
import {
  PRIVACY_POLICY_PATH,
  PRIVACY_POLICY_VERSION,
  TERMS_OF_USE_PATH,
  TERMS_OF_USE_VERSION
} from "@/lib/legal/documents";
import { ensureApiResponse } from "@/lib/observability/http";
import { captureUnexpectedError } from "@/lib/observability/sentry";
import { formatRoleLabel } from "@/lib/users/role-label";

type InvitationPayload = {
  email: string;
  name: string;
  role: "admin" | "member";
  tenantName: string;
  accountAdminName?: string | null;
  expiresAt: string;
};

type AcceptInvitationFormProps = {
  initialToken?: string;
};

function sanitizeToken(value: string) {
  const normalized = value.trim();
  const tokenParamMatch = normalized.match(/[?&]token=([a-f0-9]+)/i);
  if (tokenParamMatch?.[1]) {
    return tokenParamMatch[1];
  }

  const tokenMatch = normalized.match(/\b[a-f0-9]{48}\b/i);
  return tokenMatch?.[0] ?? normalized;
}

export function AcceptInvitationForm({ initialToken = "" }: AcceptInvitationFormProps) {
  const router = useRouter();
  const [invitation, setInvitation] = useState<InvitationPayload | null>(null);
  const normalizedToken = sanitizeToken(initialToken);
  const [isLoading, setIsLoading] = useState(() => Boolean(normalizedToken));
  const form = useForm<z.input<typeof acceptInvitationSchema>, unknown, AcceptInvitationValues>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: {
      token: normalizedToken,
      name: "",
      password: "",
      confirmPassword: "",
      acceptTermsOfUse: false,
      acceptPrivacyPolicy: false
    }
  });

  useEffect(() => {
    if (normalizedToken && window.location.search.includes("token=")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [normalizedToken]);

  useEffect(() => {
    if (!normalizedToken) {
      return;
    }

    const controller = new AbortController();

    void fetch(`/api/auth/invitation?token=${encodeURIComponent(normalizedToken)}`, {
      signal: controller.signal,
      cache: "no-store"
    })
      .then(async (response) => {
        await ensureApiResponse(response, {
          fallbackMessage: "Convite invalido",
          method: "GET",
          path: "/api/auth/invitation"
        });

        return (await response.json()) as InvitationPayload;
      })
      .then((payload) => {
        setInvitation(payload);
        form.setValue("name", payload.name);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        captureUnexpectedError(error, {
          surface: "client-form",
          route: "/accept-invitation",
          operation: "load",
          feature: "auth-invitation"
        });
        toast.error(error instanceof Error ? error.message : "Convite invalido");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [form, normalizedToken]);

  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit(
        async (values) => {
          try {
            const response = await fetch("/api/auth/accept-invitation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(values)
            });

            await ensureApiResponse(response, {
              fallbackMessage: "Falha ao aceitar convite",
              method: "POST",
              path: "/api/auth/accept-invitation"
            });

            toast.success("Convite aceito");
            router.push("/login");
            router.refresh();
          } catch (error) {
            captureUnexpectedError(error, {
              surface: "client-form",
              route: "/accept-invitation",
              operation: "submit",
              feature: "auth-invitation"
            });
            toast.error(error instanceof Error ? error.message : "Falha ao aceitar convite");
          }
        },
        (errors) => {
          const firstError =
            errors.confirmPassword?.message ||
            errors.password?.message ||
            errors.name?.message ||
            errors.acceptTermsOfUse?.message ||
            errors.acceptPrivacyPolicy?.message;
          toast.error(firstError ?? "Revise os dados do convite antes de continuar");
        }
      )}
    >
      <input type="hidden" {...form.register("token")} />

      {invitation ? (
        <div className="muted-panel text-sm text-[var(--color-muted-foreground)]">
          <p><strong className="text-[var(--color-foreground)]">Conta:</strong> {invitation.tenantName}</p>
          <p><strong className="text-[var(--color-foreground)]">E-mail:</strong> {invitation.email}</p>
          <p>
            <strong className="text-[var(--color-foreground)]">Perfil:</strong>{" "}
            {formatRoleLabel({ role: invitation.role, accountAdminName: invitation.accountAdminName })}
          </p>
        </div>
      ) : null}

      {!normalizedToken && !isLoading ? (
        <div className="muted-panel text-sm text-[var(--color-muted-foreground)]">
          O link do convite esta incompleto ou invalido. Solicite um novo convite ao administrador.
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="invite-name">Nome</Label>
        <Input disabled={isLoading} id="invite-name" {...form.register("name")} />
        {form.formState.errors.name ? (
          <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.name.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-password">Senha</Label>
        <Input disabled={isLoading} id="invite-password" type="password" {...form.register("password")} />
        {form.formState.errors.password ? (
          <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.password.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="invite-confirm-password">Confirmar senha</Label>
        <Input disabled={isLoading} id="invite-confirm-password" type="password" {...form.register("confirmPassword")} />
        {form.formState.errors.confirmPassword ? (
          <p className="text-sm text-[var(--color-destructive)]">
            {form.formState.errors.confirmPassword.message}
          </p>
        ) : null}
      </div>

      <div className="space-y-3 rounded-[22px] border border-[var(--color-border)] bg-[var(--color-card)]/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
          Aceites obrigatorios
        </p>

        <label className="flex items-start gap-3 text-sm leading-6 text-[var(--color-ink-700)]" htmlFor="accept-terms-of-use">
          <input
            className="mt-1 size-4 rounded border border-[var(--color-border)] accent-[var(--color-primary)]"
            disabled={isLoading}
            id="accept-terms-of-use"
            type="checkbox"
            {...form.register("acceptTermsOfUse")}
          />
          <span>
            Li e aceito os{" "}
            <Link className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline" href={TERMS_OF_USE_PATH} target="_blank">
              Termos de Uso
            </Link>{" "}
            vigentes ({TERMS_OF_USE_VERSION}).
          </span>
        </label>
        {form.formState.errors.acceptTermsOfUse ? (
          <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.acceptTermsOfUse.message}</p>
        ) : null}

        <label className="flex items-start gap-3 text-sm leading-6 text-[var(--color-ink-700)]" htmlFor="accept-privacy-policy">
          <input
            className="mt-1 size-4 rounded border border-[var(--color-border)] accent-[var(--color-primary)]"
            disabled={isLoading}
            id="accept-privacy-policy"
            type="checkbox"
            {...form.register("acceptPrivacyPolicy")}
          />
          <span>
            Li e aceito a{" "}
            <Link className="font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline" href={PRIVACY_POLICY_PATH} target="_blank">
              Politica de Privacidade
            </Link>{" "}
            vigente ({PRIVACY_POLICY_VERSION}).
          </span>
        </label>
        {form.formState.errors.acceptPrivacyPolicy ? (
          <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.acceptPrivacyPolicy.message}</p>
        ) : null}
      </div>

      <Button className="w-full" disabled={isLoading || !normalizedToken} type="submit">
        {isLoading ? "Validando convite..." : "Aceitar convite"}
      </Button>

      <p className="text-sm text-[var(--color-muted-foreground)]">
        Ja tem acesso? <Link className="font-semibold text-[var(--color-primary)]" href="/login">Entrar no painel</Link>
      </p>
    </form>
  );
}
