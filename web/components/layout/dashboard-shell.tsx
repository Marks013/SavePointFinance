import type { ReactNode } from "react";

import { auth, signOut } from "@/auth";
import { BrandMark } from "@/components/layout/brand-mark";
import { DashboardSidebarNav } from "@/components/layout/dashboard-sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { getSharingAuthority } from "@/lib/sharing/access";

type DashboardShellProps = {
  children: ReactNode;
};

export async function DashboardShell({ children }: DashboardShellProps) {
  const session = await auth();
  const isPlatformAdmin = Boolean(session?.user?.isPlatformAdmin);
  const canManageSharing = session?.user?.id && session.user.tenantId
    ? (
        await getSharingAuthority({
          id: session.user.id,
          tenantId: session.user.tenantId,
          role: session.user.role === "admin" ? "admin" : "member",
          isPlatformAdmin
        })
      ).canManage
    : false;
  const accessDescription = isPlatformAdmin
    ? "Administrador da plataforma"
    : canManageSharing
      ? "Titular da carteira familiar"
      : session?.user?.role === "admin"
        ? "Administrador da conta"
        : "Membro da carteira compartilhada";

  return (
    <div className="page-shell flex min-h-screen flex-col gap-5 overflow-x-clip py-4 md:py-5 lg:grid lg:h-screen lg:grid-cols-[256px_minmax(0,1fr)] lg:gap-5 lg:overflow-hidden xl:grid-cols-[264px_minmax(0,1fr)] xl:gap-6">
      <aside className="surface flex max-h-[38vh] min-h-0 flex-col overflow-y-auto rounded-[30px] p-4 lg:max-h-none xl:p-5">
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

        <DashboardSidebarNav canManageSharing={Boolean(canManageSharing)} isPlatformAdmin={isPlatformAdmin} />

        <div className="mt-6 rounded-[24px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_48%,var(--color-card))] p-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Sessão ativa
          </p>
          <p className="mt-2 text-sm font-semibold">{session?.user?.name ?? session?.user?.email ?? "Usuário"}</p>
          <p className="mt-1 text-xs leading-6 text-[var(--color-muted-foreground)]">{accessDescription}</p>
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

      <main id="main-content" className="min-h-0 min-w-0 overflow-x-clip overflow-y-auto pb-8 pr-1 lg:pb-10">{children}</main>
    </div>
  );
}
