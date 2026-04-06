"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ChartColumnBig,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FolderTree,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Split,
  Target,
  UsersRound
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMonthsToMonthKey, formatMonthKeyLabel, getCurrentMonthKey, isValidMonthKey, normalizeMonthKey } from "@/lib/month";
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
  const [draftMonth, setDraftMonth] = useState(month);
  const [isPending, startTransition] = useTransition();
  const items = [
    ...navigation,
    ...(isAdmin ? [{ href: "/dashboard/sharing" as Route, label: "Compartilhamento", icon: UsersRound }] : []),
    ...(isPlatformAdmin ? [{ href: "/dashboard/admin" as Route, label: "Admin", icon: ShieldCheck }] : [])
  ];

  const buildMonthRoute = useCallback(
    (nextMonth: string) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("month", nextMonth || getCurrentMonthKey());
      const query = nextParams.toString();

      return `${pathname}${query ? `?${query}` : ""}` as Route;
    },
    [pathname, searchParams]
  );

  const commitMonth = useCallback(
    (nextMonth: string) => {
      if (!isValidMonthKey(nextMonth)) {
        setDraftMonth(month);
        return;
      }

      const normalizedMonth = normalizeMonthKey(nextMonth);
      setDraftMonth(normalizedMonth);

      startTransition(() => {
        router.replace(buildMonthRoute(normalizedMonth), { scroll: false });
        router.refresh();
      });
    },
    [buildMonthRoute, month, router]
  );

  useEffect(() => {
    if (searchParams.get("month")) {
      return;
    }

    commitMonth(getCurrentMonthKey());
  }, [commitMonth, searchParams]);

  useEffect(() => {
    setDraftMonth(month);
  }, [month]);

  return (
    <>
      <section className="mb-5 rounded-[22px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_48%,var(--color-card))] p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
              Competência global
            </p>
            <p aria-live="polite" className="mt-1 truncate text-sm font-semibold text-[var(--color-foreground)]">
              {formatMonthKeyLabel(month)}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[0.68rem] font-semibold text-[var(--color-muted-foreground)]">
            Global
          </span>
        </div>

        <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">
          Aplica o mês ativo ao painel, transações, assinaturas, parcelas e relatórios.
        </p>

        <form
          className="mt-3 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            commitMonth(draftMonth);
          }}
        >
          <div className="grid grid-cols-[2.65rem_minmax(0,1fr)_2.65rem] items-center gap-2">
            <Button
              aria-label="Competência anterior"
              className="h-11 w-11 rounded-[1rem] px-0"
              disabled={isPending}
              type="button"
              variant="secondary"
              onClick={() => {
                commitMonth(addMonthsToMonthKey(month, -1));
              }}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              aria-label="Selecionar competência global"
              className="min-w-0 px-2 text-center text-[0.82rem]"
              id="global-month"
              type="month"
              value={draftMonth}
              onBlur={() => {
                if (!isValidMonthKey(draftMonth)) {
                  setDraftMonth(month);
                }
              }}
              onChange={(event) => {
                setDraftMonth(event.target.value);
              }}
            />
            <Button
              aria-label="Próxima competência"
              className="h-11 w-11 rounded-[1rem] px-0"
              disabled={isPending}
              type="button"
              variant="secondary"
              onClick={() => {
                commitMonth(addMonthsToMonthKey(month, 1));
              }}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <Button
            className="h-10 w-full rounded-[1rem] px-3 text-xs"
            disabled={!isValidMonthKey(draftMonth) || isPending}
            type="submit"
            variant="secondary"
          >
            {isPending ? "Aplicando..." : draftMonth === month ? "Atualizar competência" : "Aplicar competência"}
          </Button>
        </form>
      </section>

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
