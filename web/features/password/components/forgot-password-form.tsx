"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/features/password/schemas/password-schema";

export function ForgotPasswordForm() {
  const form = useForm<ForgotPasswordValues>({
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
          const response = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(values)
          });

          if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { message?: string } | null;
            toast.error(payload?.message ?? "Nao foi possivel iniciar a recuperacao");
            return;
          }

          await response.json();
          toast.success("Solicitação registrada", {
            description: "Se o e-mail existir, enviaremos o link de redefinição."
          });
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
      <Button className="w-full" type="submit">Enviar link de redefinição</Button>
    </form>
  );
}
