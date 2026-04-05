import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChartColumnBig, CreditCard, FolderTree, Landmark, LayoutDashboard, ReceiptText, RefreshCcw, Settings, Split, Target } from "lucide-react";

import { auth, signOut } from "@/auth";
import { BrandMark } from "@/components/layout/brand-mark";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";

const navigation = [
  { href: "/dashboard" as Route, label: "Painel", icon: LayoutDashboard },
  { href: "/dashboard/transactions" as Route, label: "Transações", icon: ReceiptText },
  { href: "/dashboard/categories" as Route, label: "Categorias", icon: FolderTree },
  { href: "/dashboard/accounts" as Route, label: "Contas", icon: Landmark },
  { href: "/dashboard/cards" as Route, label: "Cartões", icon: CreditCard },
  { href: "/dashboard/subscriptions" as Route, label: "Assinaturas", icon: RefreshCcw },
  { href: "/dashboard/installments" as Route, label: "Parcelas", icon: Split },
  { href: "/dashboard/goals" as Route, label: "Metas", icon: Target },
  { href: "/dashboard/reports" as Route, label: "Relatórios", icon: ChartColumnBig },
  { href: "/dashboard/settings" as Route, label: "Configurações", icon: Settings }
];

type DashboardShellProps = {
  children: ReactNode;
};

export async function DashboardShell({ children }: DashboardShellProps) {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";
  const items = [...navigation, ...(isAdmin ? [{ href: "/dashboard/admin" as Route, label: "Admin", icon: Settings }] : [])];

  return (
    <div className="page-shell min-h-screen py-4 md:py-5 lg:grid lg:grid-cols-[256px_minmax(0,1fr)] lg:gap-5 xl:grid-cols-[264px_minmax(0,1fr)] xl:gap-6">
      <aside className="surface h-fit rounded-[30px] p-4 lg:sticky lg:top-5 xl:p-5">
        <div className="mb-6 rounded-[24px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_86%,transparent)] p-4">
          <div className="flex flex-col gap-3">
            <BrandMark compact />
            <div className="flex justify-start">
              <ThemeToggle compact />
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--color-muted-foreground)]">
            Navegação principal do ambiente financeiro.
          </p>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Módulos</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">{items.length} áreas</p>
        </div>

        <nav className="space-y-2">
          {items.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                className="group flex items-center gap-3 rounded-[1.15rem] border border-transparent px-3.5 py-3 text-sm font-medium text-[var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(19,111,79,0.14)] hover:bg-[color-mix(in_srgb,var(--color-card)_82%,var(--color-muted))]"
                href={item.href}
              >
                <span className="flex size-8 items-center justify-center rounded-[0.9rem] bg-[color-mix(in_srgb,var(--color-card)_84%,var(--color-muted))] text-[var(--color-primary)] transition group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-primary-foreground)]">
                  <Icon className="size-4" />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 rounded-[24px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_48%,var(--color-card))] p-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">Sessão ativa</p>
          <p className="mt-2 text-sm font-semibold">{session?.user?.name ?? session?.user?.email ?? "Usuário"}</p>
          <p className="mt-1 text-xs leading-6 text-[var(--color-muted-foreground)]">
            {session?.user?.role === "admin" ? "Acesso administrativo liberado" : "Acesso operacional"}
          </p>
          <form
            aria-label="Encerrar sessão"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button className="mt-4 w-full" type="submit" variant="secondary">
              Encerrar sessão
            </Button>
          </form>
        </div>
      </aside>

      <main className="mt-5 min-w-0 pb-8 lg:mt-0 lg:pb-10">{children}</main>
    </div>
  );
}
