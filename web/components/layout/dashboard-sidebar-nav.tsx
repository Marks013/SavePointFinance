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
  MessageCircleMore,
  Wallet,
  UsersRound
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { addMonthsToMonthKey, formatMonthKeyLabel, getCurrentMonthKey, isValidMonthKey, normalizeMonthKey } from "@/lib/month";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/dashboard" as Route, label: "Painel", icon: LayoutDashboard },
  { href: "/dashboard/transactions" as Route, label: "Transações", icon: ReceiptText },
  { href: "/dashboard/categories" as Route, label: "Categorias", icon: FolderTree },
  { href: "/dashboard/benefits" as Route, label: "Vale Alimentação", icon: Wallet },
  { href: "/dashboard/accounts" as Route, label: "Contas", icon: Landmark },
  { href: "/dashboard/cards" as Route, label: "Cartões", icon: CreditCard },
  { href: "/dashboard/subscriptions" as Route, label: "Assinaturas", icon: RefreshCcw },
  { href: "/dashboard/installments" as Route, label: "Parcelas", icon: Split },
  { href: "/dashboard/goals" as Route, label: "Metas", icon: Target },
  { href: "/dashboard/reports" as Route, label: "Relatórios", icon: ChartColumnBig },
  { href: "/dashboard/whatsapp" as Route, label: "WhatsApp", icon: MessageCircleMore },
  { href: "/dashboard/settings" as Route, label: "Configurações", icon: Settings }
];

const platformAdminNavigation = [{ href: "/dashboard/admin" as Route, label: "Admin", icon: ShieldCheck }];

type DashboardSidebarNavProps = {
  canManageSharing: boolean;
  isPlatformAdmin: boolean;
};

export function DashboardSidebarNav({ canManageSharing, isPlatformAdmin }: DashboardSidebarNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const month = normalizeMonthKey(searchParams.get("month"));
  const [draftMonthState, setDraftMonthState] = useState({ sourceMonth: month, value: month });
  const draftMonth = draftMonthState.sourceMonth === month ? draftMonthState.value : month;
  const [isPending, startTransition] = useTransition();
  const items = isPlatformAdmin
    ? platformAdminNavigation
    : [
        ...navigation,
        ...(canManageSharing ? [{ href: "/dashboard/sharing" as Route, label: "Compartilhar carteira", icon: UsersRound }] : [])
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
        setDraftMonthState({ sourceMonth: month, value: month });
        return;
      }

      const normalizedMonth = normalizeMonthKey(nextMonth);
      setDraftMonthState({ sourceMonth: normalizedMonth, value: normalizedMonth });

      startTransition(() => {
        router.replace(buildMonthRoute(normalizedMonth), { scroll: false });
      });
    },
    [buildMonthRoute, month, router]
  );

  useEffect(() => {
    if (isPlatformAdmin) {
      return;
    }

    if (searchParams.get("month")) {
      return;
    }

    router.replace(buildMonthRoute(getCurrentMonthKey()), { scroll: false });
  }, [buildMonthRoute, isPlatformAdmin, router, searchParams]);

  return (
    <>
      {isPlatformAdmin ? null : (
        <section className="mb-5 rounded-[22px] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-muted)_48%,var(--color-card))] p-3.5">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
            Mês de análise
          </p>
          <p aria-live="polite" className="mt-1 text-sm font-semibold leading-5 text-[var(--color-foreground)]">
            {formatMonthKeyLabel(month)}
          </p>

          <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">
            Usa o mesmo mês em painel, transações, assinaturas, parcelas e relatórios.
          </p>

          <div className="mt-3 grid gap-2">
            <DatePickerInput
              aria-label="Selecionar competência global"
              className="h-11 w-full min-w-0 px-3 text-center text-[0.9rem]"
              disabled={isPending}
              displayAlign="center"
              id="global-month"
              monthDisplayMode="compact"
              type="month"
              value={draftMonth}
              onBlur={() => {
                if (!isValidMonthKey(draftMonth)) {
                  setDraftMonthState({ sourceMonth: month, value: month });
                }
              }}
              onChange={(event) => {
                const nextMonth = event.target.value;
                setDraftMonthState({ sourceMonth: month, value: nextMonth });

                if (isValidMonthKey(nextMonth)) {
                  commitMonth(nextMonth);
                }
              }}
            />

            <div className="grid grid-cols-2 gap-2">
              <Button
                aria-label="Competência anterior"
                className="h-10 rounded-[1rem] px-0"
                disabled={isPending}
                type="button"
                variant="secondary"
                onClick={() => {
                  commitMonth(addMonthsToMonthKey(month, -1));
                }}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                aria-label="Próxima competência"
                className="h-10 rounded-[1rem] px-0"
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
          </div>
        </section>
      )}

      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
          Navegação
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          {isPlatformAdmin ? "Administração da plataforma" : "Rotina financeira"}
        </p>
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
              href={isPlatformAdmin ? item.href : (`${item.href}?month=${month}` as Route)}
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
