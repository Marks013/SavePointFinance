"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { startTransition, useCallback, useEffect } from "react";
import {
  ChartColumnBig,
  CreditCard,
  FolderTree,
  Landmark,
  LayoutDashboard,
  ShieldCheck,
  UsersRound,
  ReceiptText,
  RefreshCcw,
  Settings,
  Split,
  Target
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { formatMonthKeyLabel, getCurrentMonthKey, normalizeMonthKey } from "@/lib/month";
import { cn } from "@/lib/utils";

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

type DashboardSidebarNavProps = {
  isAdmin: boolean;
  isPlatformAdmin: boolean;
};

export function DashboardSidebarNav({ isAdmin, isPlatformAdmin }: DashboardSidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const month = normalizeMonthKey(searchParams.get("month"));
  const items = [
    ...navigation,
    ...(isAdmin ? [{ href: "/dashboard/sharing" as Route, label: "Compartilhamento", icon: UsersRound }] : []),
    ...(isPlatformAdmin ? [{ href: "/dashboard/admin" as Route, label: "Admin", icon: ShieldCheck }] : [])
  ];
  const replaceWithMonth = useCallback(
    (nextMonth: string) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("month", nextMonth || getCurrentMonthKey());
      const nextRoute = `${pathname}?${nextParams.toString()}` as Route;
      router.replace(nextRoute, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    if (searchParams.get("month")) {
      return;
    }

    replaceWithMonth(getCurrentMonthKey());
  }, [replaceWithMonth, searchParams]);

  return (
    <>
      <div className="mb-5 rounded-[24px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_48%,var(--color-card))] p-4">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          Competência global
        </p>
        <p className="mt-2 text-sm font-semibold text-[var(--color-foreground)]">{formatMonthKeyLabel(month)}</p>
        <p className="mt-1 text-xs leading-6 text-[var(--color-muted-foreground)]">
          Painel, transações, assinaturas e parcelas seguem este mês durante a navegação.
        </p>
        <Input
          className="mt-4"
          id="global-month"
          type="month"
          value={month}
          onChange={(event) => {
            startTransition(() => {
              replaceWithMonth(event.target.value);
            });
          }}
        />
      </div>

      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          Módulos
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">{items.length} áreas</p>
      </div>

      <nav className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-[1.15rem] border border-transparent px-3.5 py-3 text-sm font-medium text-[var(--color-foreground)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[rgba(19,111,79,0.14)] hover:bg-[color-mix(in_srgb,var(--color-card)_82%,var(--color-muted))]",
                isActive && "border-[rgba(19,111,79,0.18)] bg-[color-mix(in_srgb,var(--color-card)_82%,var(--color-muted))]"
              )}
              href={`${item.href}?month=${month}`}
            >
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-[0.9rem] bg-[color-mix(in_srgb,var(--color-card)_84%,var(--color-muted))] text-[var(--color-primary)] transition group-hover:bg-[var(--color-primary)] group-hover:text-[var(--color-primary-foreground)]",
                  isActive && "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                )}
              >
                <Icon className="size-4" />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
