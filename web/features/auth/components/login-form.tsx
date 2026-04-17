"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginSchema } from "@/features/auth/schemas/login-schema";

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [authError, setAuthError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<z.input<typeof loginSchema>, unknown, LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      setAuthError(null);
      const result = await signIn("credentials", {
        ...values,
        redirect: false
      });

      if (!result?.ok || result.error) {
        const message = "E-mail, senha ou status da conta invalido.";
        setAuthError(message);
        toast.error("Falha ao autenticar", {
          description: message
        });
        return;
      }

      toast.success("Sessao iniciada");
      router.push("/dashboard");
      router.refresh();
    });
  });

  return (
    <form className="mt-8 space-y-5" onSubmit={onSubmit}>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" placeholder="voce@empresa.com" type="email" {...register("email")} />
        {errors.email ? <p className="text-sm text-[var(--color-destructive)]">{errors.email.message}</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input id="password" placeholder="••••••••" type="password" {...register("password")} />
        {errors.password ? (
          <p className="text-sm text-[var(--color-destructive)]">{errors.password.message}</p>
        ) : null}
      </div>

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? "Entrando..." : "Entrar no painel"}
      </Button>

      <p className="text-center text-sm leading-6 text-[var(--color-muted-foreground)]">
        🔒 Seus dados são criptografados de ponta a ponta e armazenados com segurança.
      </p>

      {authError ? (
        <p className="text-sm text-[var(--color-destructive)]" role="alert">
          {authError}
        </p>
      ) : null}
    </form>
  );
}
