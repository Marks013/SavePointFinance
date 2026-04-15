"use client";

import dynamic from "next/dynamic";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";

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
          {children}
          <Toaster richColors position="top-right" />
          <QueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
