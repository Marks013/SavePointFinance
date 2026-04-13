"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acceptInvitationSchema, type AcceptInvitationValues } from "@/features/password/schemas/password-schema";
import { ensureApiResponse } from "@/lib/observability/http";
import { captureUnexpectedError } from "@/lib/observability/sentry";

type InvitationPayload = {
  email: string;
  name: string;
  role: "admin" | "member";
  tenantName: string;
  expiresAt: string;
};

type AcceptInvitationFormProps = {
  initialToken?: string;
};

function formatRoleLabel(role: "admin" | "member") {
  return role === "admin" ? "Administrador" : "Membro";
}

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
  const [isLoading, setIsLoading] = useState(true);
  const normalizedToken = sanitizeToken(initialToken);
  const form = useForm<AcceptInvitationValues>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: {
      token: normalizedToken,
      name: "",
      password: "",
      confirmPassword: ""
    }
  });

  useEffect(() => {
    if (!normalizedToken) {
      setIsLoading(false);
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
          const firstError = errors.confirmPassword?.message || errors.password?.message || errors.name?.message;
          toast.error(firstError ?? "Revise os dados do convite antes de continuar");
        }
      )}
    >
      <input type="hidden" {...form.register("token")} />

      {invitation ? (
        <div className="muted-panel text-sm text-[var(--color-muted-foreground)]">
          <p><strong className="text-[var(--color-foreground)]">Conta:</strong> {invitation.tenantName}</p>
          <p><strong className="text-[var(--color-foreground)]">E-mail:</strong> {invitation.email}</p>
          <p><strong className="text-[var(--color-foreground)]">Perfil:</strong> {formatRoleLabel(invitation.role)}</p>
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

      <Button className="w-full" disabled={isLoading || !normalizedToken} type="submit">
        {isLoading ? "Validando convite..." : "Aceitar convite"}
      </Button>

      <p className="text-sm text-[var(--color-muted-foreground)]">
        Ja tem acesso? <Link className="font-semibold text-[var(--color-primary)]" href="/login">Entrar no painel</Link>
      </p>
    </form>
  );
}
