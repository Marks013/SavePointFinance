"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/features/password/schemas/password-schema";
import { ensureApiResponse } from "@/lib/observability/http";
import { captureUnexpectedError } from "@/lib/observability/sentry";

export function ForgotPasswordForm() {
  const form = useForm<z.input<typeof forgotPasswordSchema>, unknown, ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: ""
    }
  });

  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit(
        async (values) => {
          try {
            const response = await fetch("/api/auth/forgot-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(values)
            });

            await ensureApiResponse(response, {
              fallbackMessage: "Nao foi possivel iniciar a recuperacao",
              method: "POST",
              path: "/api/auth/forgot-password"
            });

            await response.json();
            toast.success("Solicitacao registrada", {
              description: "Se o e-mail existir, enviaremos o link de redefinicao."
            });
          } catch (error) {
            captureUnexpectedError(error, {
              surface: "client-form",
              route: "/forgot-password",
              operation: "submit",
              feature: "auth-password"
            });
            toast.error(error instanceof Error ? error.message : "Nao foi possivel iniciar a recuperacao");
          }
        },
        (errors) => {
          toast.error(errors.email?.message ?? "Revise o e-mail informado");
        }
      )}
    >
      <div className="space-y-2">
        <Label htmlFor="forgot-email">E-mail</Label>
        <Input id="forgot-email" placeholder="voce@empresa.com" type="email" {...form.register("email")} />
        {form.formState.errors.email ? (
          <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.email.message}</p>
        ) : null}
      </div>
      <Button className="w-full" type="submit">Enviar link de redefinicao</Button>
    </form>
  );
}
