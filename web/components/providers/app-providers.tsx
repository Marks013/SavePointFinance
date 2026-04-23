"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { toast, Toaster } from "sonner";

import { captureUnexpectedError, syncSentryAccessScope } from "@/lib/observability/sentry";
import { ThemeProvider } from "@/components/providers/theme-provider";

const QueryDevtools =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () => import("@tanstack/react-query-devtools").then((module) => module.ReactQueryDevtools),
        { ssr: false }
      )
    : function QueryDevtoolsFallback() {
        return null;
      };

type AppProvidersProps = {
  children: ReactNode;
  initialTheme?: "light" | "dark";
  initialSession?: Session | null;
};

const INACTIVITY_NOTICE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function serializeKey(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function SentryAccessScope() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      syncSentryAccessScope(null);
      return;
    }

    syncSentryAccessScope({
      id: session.user.id,
      tenantId: session.user.tenantId ?? null,
      role: session.user.role ?? null,
      isPlatformAdmin: session.user.isPlatformAdmin ?? false
    });
  }, [session, status]);

  return null;
}

function PlatformAdminRouteIsolation() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.isPlatformAdmin) {
      return;
    }

    if (pathname === "/dashboard/admin" && searchParams.has("month")) {
      router.replace("/dashboard/admin");
      return;
    }

    if (pathname.startsWith("/dashboard") && pathname !== "/dashboard/admin") {
      router.replace("/dashboard/admin");
    }
  }, [pathname, router, searchParams, session, status]);

  return null;
}

function WelcomeBackInactivityNotice() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !session?.user?.id ||
      !session.user.previousLastLogin ||
      session.user.isPlatformAdmin
    ) {
      return;
    }

    const previousLoginAt = new Date(session.user.previousLastLogin);

    if (Number.isNaN(previousLoginAt.getTime())) {
      return;
    }

    const inactiveDays = Math.floor((Date.now() - previousLoginAt.getTime()) / DAY_MS);

    if (inactiveDays < INACTIVITY_NOTICE_DAYS) {
      return;
    }

    const storageKey = `savepoint:welcome-back:${session.user.id}:${previousLoginAt.toISOString().slice(0, 10)}`;

    if (window.localStorage.getItem(storageKey)) {
      return;
    }

    window.localStorage.setItem(storageKey, "shown");

    toast.custom(
      (id) => (
        <div className="max-w-sm rounded-[1.4rem] border border-[var(--color-border)] bg-[var(--color-card)] p-4 text-[var(--color-foreground)] shadow-[0_22px_60px_rgba(15,23,42,0.22)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-foreground)]">
            Bem-vindo de volta
          </p>
          <p className="mt-2 text-base font-semibold">Sentimos sua falta por aqui.</p>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
            Foram {inactiveDays} dias sem login. Sua conta continua segura, mas depois de 90 dias sem atividade ela
            entra na rotina de encerramento automático.
          </p>
          <button
            className="mt-3 rounded-full bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-[var(--color-primary-foreground)]"
            onClick={() => toast.dismiss(id)}
            type="button"
          >
            Bora organizar
          </button>
        </div>
      ),
      { duration: 12000 }
    );
  }, [session, status]);

  return null;
}

export function AppProviders({ children, initialTheme, initialSession }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            captureUnexpectedError(error, {
              surface: "client-query",
              route: typeof window !== "undefined" ? window.location.pathname : undefined,
              operation: "query",
              feature: "react-query",
              extra: {
                queryHash: query.queryHash,
                queryKey: query.queryKey
              },
              dedupeKey: `query:${query.queryHash}:${error instanceof Error ? error.message : String(error)}`
            });
          }
        }),
        mutationCache: new MutationCache({
          onError: (error, _variables, _context, mutation) => {
            captureUnexpectedError(error, {
              surface: "client-mutation",
              route: typeof window !== "undefined" ? window.location.pathname : undefined,
              operation: "mutation",
              feature: "react-query",
              extra: {
                mutationKey: mutation.options.mutationKey ?? null,
                meta: mutation.options.meta ?? null
              },
              dedupeKey: `mutation:${serializeKey(mutation.options.mutationKey)}:${error instanceof Error ? error.message : String(error)}`
            });
          }
        }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false
          }
        }
      })
  );

  return (
    <ThemeProvider initialTheme={initialTheme}>
      <SessionProvider session={initialSession}>
        <QueryClientProvider client={queryClient}>
          <SentryAccessScope />
          <PlatformAdminRouteIsolation />
          <WelcomeBackInactivityNotice />
          {children}
          <Toaster richColors position="top-right" />
          <QueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
