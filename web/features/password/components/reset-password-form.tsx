"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordSchema, type ResetPasswordValues } from "@/features/password/schemas/password-schema";
import { ensureApiResponse } from "@/lib/observability/http";
import { captureUnexpectedError } from "@/lib/observability/sentry";

type ResetPasswordFormProps = {
  initialToken?: string;
};

export function ResetPasswordForm({ initialToken = "" }: ResetPasswordFormProps) {
  const form = useForm<z.input<typeof resetPasswordSchema>, unknown, ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      token: initialToken,
      newPassword: "",
      confirmPassword: ""
    }
  });

  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit(
        async (values) => {
          try {
            const response = await fetch("/api/auth/reset-password", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(values)
            });

            await ensureApiResponse(response, {
              fallbackMessage: "Falha ao redefinir senha",
              method: "POST",
              path: "/api/auth/reset-password"
            });

            toast.success("Senha redefinida");
          } catch (error) {
            captureUnexpectedError(error, {
              surface: "client-form",
              route: "/reset-password",
              operation: "submit",
              feature: "auth-password"
            });
            toast.error(error instanceof Error ? error.message : "Falha ao redefinir senha");
          }
        },
        (errors) => {
          const firstError =
            errors.confirmPassword?.message || errors.newPassword?.message || errors.token?.message;
          toast.error(firstError ?? "Revise os dados antes de continuar");
        }
      )}
    >
      <div className="space-y-2">
        <Label htmlFor="reset-token">Token</Label>
        <Input id="reset-token" placeholder="Cole o token de recuperacao" {...form.register("token")} />
        {form.formState.errors.token ? (
          <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.token.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="reset-new">Nova senha</Label>
        <Input id="reset-new" type="password" {...form.register("newPassword")} />
        {form.formState.errors.newPassword ? (
          <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.newPassword.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="reset-confirm">Confirmar senha</Label>
        <Input id="reset-confirm" type="password" {...form.register("confirmPassword")} />
        {form.formState.errors.confirmPassword ? (
          <p className="text-sm text-[var(--color-destructive)]">
            {form.formState.errors.confirmPassword.message}
          </p>
        ) : null}
      </div>
      <Button className="w-full" type="submit">Redefinir senha</Button>
    </form>
  );
}
