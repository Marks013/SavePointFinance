import type { Metadata } from "next";
import { cookies } from "next/headers";
import { type ReactNode } from "react";

import { auth } from "@/auth";
import { GlobalThemeToggle } from "@/components/layout/global-theme-toggle";
import { AppProviders } from "@/components/providers/app-providers";
import { captureUnexpectedError } from "@/lib/observability/sentry";
import { themeBootstrapScript } from "@/lib/security/theme-bootstrap";

import "./globals.css";

export const metadata: Metadata = {
  title: "Save Point Finança",
  description: "Plataforma financeira para contas, cartões, metas, relatórios, automações e rotina operacional."
};

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const cookieStore = await cookies();
  const storedTheme = cookieStore.get("savepoint-theme")?.value;
  const initialTheme = storedTheme === "light" ? "light" : "dark";
  const initialSession = await auth().catch((error) => {
    captureUnexpectedError(error, {
      surface: "server-layout",
      route: "/",
      operation: "render",
      feature: "auth"
    });
    return null;
  });

  return (
    <html data-theme={initialTheme} lang="pt-BR" suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main-content">
          Pular para o conteúdo principal
        </a>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <AppProviders initialSession={initialSession} initialTheme={initialTheme}>
          <div className="grain" />
          <GlobalThemeToggle />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
