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
      onSubmit={form.handleSubmit(async (values) => {
        const response = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values)
        });

        if (!response.ok) {
          toast.error("Nao foi possivel iniciar a recuperacao");
          return;
        }

        await response.json();
        toast.success("Solicitação registrada", {
          description: "Se o e-mail existir, enviaremos o link de redefinição."
        });
      })}
    >
      <div className="space-y-2">
        <Label htmlFor="forgot-email">E-mail</Label>
        <Input id="forgot-email" placeholder="voce@empresa.com" type="email" {...form.register("email")} />
      </div>
      <Button className="w-full" type="submit">Enviar link de redefinição</Button>
    </form>
  );
}
