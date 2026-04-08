"use client";

import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";

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
};

export function AppProviders({ children, initialTheme }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
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
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster richColors position="top-right" />
          <QueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
