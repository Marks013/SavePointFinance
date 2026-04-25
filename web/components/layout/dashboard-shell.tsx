import type { ReactNode } from "react";
import Link from "next/link";

import { auth, signOut } from "@/auth";
import { BrandMark } from "@/components/layout/brand-mark";
import { DashboardSidebarNav } from "@/components/layout/dashboard-sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { formatDateTimeDisplay } from "@/lib/date";
import { prisma } from "@/lib/prisma/client";
import { getSharingAuthority } from "@/lib/sharing/access";

type DashboardShellProps = {
  children: ReactNode;
  currentPathname?: string | null;
};

function formatLastAccess(value: Date | null) {
  if (!value) {
    return "Primeiro acesso registrado nesta conta";
  }

  const now = new Date();
  const access = new Date(value);
  const todayKey = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const timeLabel = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(access);

  if (access.toDateString() === todayKey) {
    return `Hoje às ${timeLabel}`;
  }

  if (access.toDateString() === yesterday.toDateString()) {
    return `Ontem às ${timeLabel}`;
  }

  return formatDateTimeDisplay(access);
}

export async function DashboardShell({ children, currentPathname }: DashboardShellProps) {
  const session = await auth();
  const accessAudit = session?.user?.id
    ? await prisma.adminAuditLog.findMany({
        where: {
          actorUserId: session.user.id,
          action: "auth.login"
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 2,
        select: {
          createdAt: true
        }
      })
    : null;
  const previousAccessAt = accessAudit?.[1]?.createdAt ?? accessAudit?.[0]?.createdAt ?? null;
  const isPlatformAdmin = Boolean(session?.user?.isPlatformAdmin);
  const usageLock =
    !isPlatformAdmin && session?.user?.tenantId
      ? await prisma.tenant
          .findUnique({
            where: { id: session.user.tenantId },
            select: {
              planConfig: {
                select: {
                  tier: true,
                  maxAccounts: true,
                  maxCards: true
                }
              },
              _count: {
                select: {
                  financials: { where: { isActive: true } },
                  cards: { where: { isActive: true } }
                }
              }
            }
          })
          .then((tenant) => {
            if (!tenant || tenant.planConfig.tier !== "free") {
              return null;
            }

            const accountsLimit = tenant.planConfig.maxAccounts;
            const cardsLimit = tenant.planConfig.maxCards;
            const accountsExceeded = accountsLimit !== null && tenant._count.financials > accountsLimit;
            const cardsExceeded = cardsLimit !== null && tenant._count.cards > cardsLimit;

            return accountsExceeded || cardsExceeded
              ? {
                  accounts: tenant._count.financials,
                  accountsLimit,
                  cards: tenant._count.cards,
                  cardsLimit
                }
              : null;
          })
      : null;
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
        ? "Admin de Conta"
        : "Familiar da carteira compartilhada";
  const showUsageLock = Boolean(
    usageLock && currentPathname !== "/dashboard/accounts" && currentPathname !== "/dashboard/cards"
  );

  return (
    <div className="page-shell flex min-h-screen flex-col gap-5 py-4 md:py-5 lg:grid lg:h-screen lg:grid-cols-[256px_minmax(0,1fr)] lg:gap-5 lg:overflow-y-hidden xl:grid-cols-[264px_minmax(0,1fr)] xl:gap-6">
      <aside className="surface subtle-scrollbar flex min-h-0 flex-col overflow-visible rounded-[30px] p-4 lg:max-h-none lg:overflow-y-auto xl:p-5">
        <div className="mb-6 rounded-[24px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_86%,transparent)] p-4">
          <div className="flex flex-col gap-3">
            <BrandMark compact />
            <div className="flex justify-start">
              <ThemeToggle compact />
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--color-muted-foreground)]">
            {isPlatformAdmin ? "Navegação principal da administração da plataforma." : "Navegação principal do ambiente financeiro."}
          </p>
        </div>

        <DashboardSidebarNav canManageSharing={Boolean(canManageSharing)} isPlatformAdmin={isPlatformAdmin} />

        <div className="mt-6 rounded-[24px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_48%,var(--color-card))] p-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Sessão ativa
          </p>
          <p className="mt-2 text-sm font-semibold">{session?.user?.name ?? session?.user?.email ?? "Usuário"}</p>
          <p className="mt-1 text-xs leading-6 text-[var(--color-muted-foreground)]">{accessDescription}</p>
          <div className="mt-4 rounded-[18px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_84%,transparent)] px-3 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
              Histórico de segurança
            </p>
            <p className="mt-2 text-sm font-medium text-[var(--color-foreground)]">
              Último acesso: {formatLastAccess(previousAccessAt)}
            </p>
            <p className="mt-1 text-xs leading-6 text-[var(--color-muted-foreground)]">
              Cada autenticação gera registro de acesso para reforçar a segurança da sua conta.
            </p>
          </div>
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

      <main
        id="main-content"
        className="subtle-scrollbar min-h-0 min-w-0 w-full max-w-full overflow-x-hidden overflow-y-auto pb-8 pr-0 lg:pb-10 lg:pr-1"
      >
        {children}
      </main>
      {showUsageLock && usageLock ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--color-background)_82%,black)] p-4 backdrop-blur-sm">
          <section className="surface max-w-xl p-6">
            <div className="eyebrow">Plano gratuito</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">Regularize os limites para continuar</h2>
            <p className="mt-3 text-sm leading-7 text-[var(--color-muted-foreground)]">
              Sua conta voltou ao plano gratuito e possui itens acima do limite permitido. Exclua contas bancarias ou
              cartoes excedentes para liberar a plataforma novamente.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="muted-panel">
                <p className="text-sm font-semibold">Contas bancarias</p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  {usageLock.accounts} de {usageLock.accountsLimit ?? "ilimitado"}
                </p>
              </div>
              <div className="muted-panel">
                <p className="text-sm font-semibold">Cartoes de credito</p>
                <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
                  {usageLock.cards} de {usageLock.cardsLimit ?? "ilimitado"}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/dashboard/accounts">Ajustar contas</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/dashboard/cards">Ajustar cartoes</Link>
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
