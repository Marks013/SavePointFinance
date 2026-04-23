"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { publicRegistrationSchema, type PublicRegistrationValues } from "@/features/password/schemas/password-schema";
import {
  PRIVACY_POLICY_PATH,
  PRIVACY_POLICY_VERSION,
  TERMS_OF_USE_PATH,
  TERMS_OF_USE_VERSION
} from "@/lib/legal/documents";
import { ensureApiResponse } from "@/lib/observability/http";

type RegistrationPlan = PublicRegistrationValues["plan"];

type PublicRegistrationFormProps = {
  initialPlan: RegistrationPlan;
};

type RegistrationResponse = {
  nextPath?: Route;
};

const planCopy: Record<RegistrationPlan, string> = {
  free: "Cria uma conta gratuita imediatamente, sem checkout.",
  trial: "Cria sua avaliação Pro com 14 dias de recursos premium.",
  pro: "Cria sua conta e abre o checkout do Mercado Pago em seguida."
};

export function PublicRegistrationForm({ initialPlan }: PublicRegistrationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<z.input<typeof publicRegistrationSchema>, unknown, PublicRegistrationValues>({
    resolver: zodResolver(publicRegistrationSchema),
    defaultValues: {
      plan: initialPlan,
      name: "",
      organizationName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTermsOfUse: false,
      acceptPrivacyPolicy: false
    }
  });
  const selectedPlan = useWatch({
    control: form.control,
    name: "plan"
  });

  return (
    <form
      className="space-y-5"
      onSubmit={form.handleSubmit(
        (values) => {
          startTransition(async () => {
            try {
              const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values)
              });

              await ensureApiResponse(response, {
                fallbackMessage: "Falha ao criar conta",
                method: "POST",
                path: "/api/auth/register"
              });

              const payload = (await response.json()) as RegistrationResponse;
              const authResult = await signIn("credentials", {
                email: values.email,
                password: values.password,
                redirect: false
              });

              if (!authResult?.ok || authResult.error) {
                toast.success("Verifique seu e-mail e senha para continuar.");
                router.replace("/login");
                router.refresh();
                return;
              }

              toast.success(values.plan === "pro" ? "Conta criada. Abrindo checkout." : "Conta criada com sucesso.");
              const nextPath = payload.nextPath ?? ((values.plan === "pro" ? "/billing?intent=checkout" : "/dashboard") as Route);

              router.replace(nextPath);
              router.refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Falha ao criar conta");
            }
          });
        },
        (errors) => {
          const firstError =
            errors.email?.message ||
            errors.name?.message ||
            errors.organizationName?.message ||
            errors.password?.message ||
            errors.confirmPassword?.message ||
            errors.acceptTermsOfUse?.message ||
            errors.acceptPrivacyPolicy?.message;
          toast.error(firstError ?? "Revise os dados antes de continuar");
        }
      )}
    >
      <div className="space-y-2">
        <Label htmlFor="registration-plan">Plano inicial</Label>
        <Select id="registration-plan" {...form.register("plan")}>
          <option value="free">Gratuito Essencial</option>
          <option value="trial">Avaliação Premium 14 dias</option>
          <option value="pro">Assinar Premium Completo</option>
        </Select>
        <p className="text-sm leading-6 text-[var(--color-muted-foreground)]">{planCopy[selectedPlan]}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="registration-name">Seu nome</Label>
          <Input id="registration-name" disabled={isPending} {...form.register("name")} />
          {form.formState.errors.name ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.name.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="registration-organization">Nome da conta</Label>
          <Input id="registration-organization" disabled={isPending} placeholder="Ex.: Familia Silva" {...form.register("organizationName")} />
          {form.formState.errors.organizationName ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.organizationName.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="registration-email">E-mail</Label>
        <Input id="registration-email" disabled={isPending} type="email" {...form.register("email")} />
        {form.formState.errors.email ? (
          <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.email.message}</p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="registration-password">Senha</Label>
          <Input id="registration-password" autoComplete="new-password" disabled={isPending} type="password" {...form.register("password")} />
          {form.formState.errors.password ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.password.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="registration-confirm-password">Confirmar senha</Label>
          <Input
            id="registration-confirm-password"
            autoComplete="new-password"
            disabled={isPending}
            type="password"
            {...form.register("confirmPassword")}
          />
          {form.formState.errors.confirmPassword ? (
            <p className="text-sm text-[var(--color-destructive)]">{form.formState.errors.confirmPassword.message}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 rounded-[22px] border border-[var(--color-border)] bg-[var(--color-card)]/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
          Aceites obrigatorios
        </p>

        <label className="flex items-start gap-3 text-sm leading-6 text-[var(--color-ink-700)]" htmlFor="registration-terms">
          <input
            className="mt-1 size-4 rounded border border-[var(--color-border)] accent-[var(--color-primary)]"
            disabled={isPending}
            id="registration-terms"
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

        <label className="flex items-start gap-3 text-sm leading-6 text-[var(--color-ink-700)]" htmlFor="registration-privacy">
          <input
            className="mt-1 size-4 rounded border border-[var(--color-border)] accent-[var(--color-primary)]"
            disabled={isPending}
            id="registration-privacy"
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
      </div>

      <Button className="w-full" disabled={isPending} type="submit">
        {isPending ? "Criando conta..." : selectedPlan === "pro" ? "Criar conta e abrir checkout" : "Criar minha conta"}
      </Button>

      <p className="text-sm text-[var(--color-muted-foreground)]">
        Ja tem acesso? <Link className="font-semibold text-[var(--color-primary)]" href="/login">Entrar no painel</Link>
      </p>
    </form>
  );
}
