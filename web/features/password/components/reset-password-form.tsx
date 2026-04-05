"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordSchema, type ResetPasswordValues } from "@/features/password/schemas/password-schema";

type ResetPasswordFormProps = {
  initialToken?: string;
};

export function ResetPasswordForm({ initialToken = "" }: ResetPasswordFormProps) {
  const form = useForm<ResetPasswordValues>({
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
      onSubmit={form.handleSubmit(async (values) => {
        const response = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values)
        });

        if (!response.ok) {
          const payload = (await response.json()) as { message?: string };
          toast.error(payload.message ?? "Falha ao redefinir senha");
          return;
        }

        toast.success("Senha redefinida");
      })}
    >
      <div className="space-y-2">
        <Label htmlFor="reset-token">Token</Label>
        <Input id="reset-token" placeholder="Cole o token de recuperacao" {...form.register("token")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reset-new">Nova senha</Label>
        <Input id="reset-new" type="password" {...form.register("newPassword")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reset-confirm">Confirmar senha</Label>
        <Input id="reset-confirm" type="password" {...form.register("confirmPassword")} />
      </div>
      <Button className="w-full" type="submit">Redefinir senha</Button>
    </form>
  );
}
