import type { Metadata } from "next";
import { cookies } from "next/headers";
import { type ReactNode } from "react";

import { GlobalThemeToggle } from "@/components/layout/global-theme-toggle";
import { AppProviders } from "@/components/providers/app-providers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Save Point Finança",
  description: "Plataforma financeira para contas, cartões, metas, relatórios, automações e rotina operacional."
};

const themeBootstrapScript = `
  (function () {
    try {
      var key = "savepoint-theme";
      var stored = window.localStorage.getItem(key);
      var theme = stored === "light" ? "light" : "dark";
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch (error) {
      document.documentElement.dataset.theme = "dark";
      document.documentElement.style.colorScheme = "dark";
    }
  })();
`;

type RootLayoutProps = {
  children: ReactNode;
};

export default async function RootLayout({ children }: RootLayoutProps) {
  const cookieStore = await cookies();
  const storedTheme = cookieStore.get("savepoint-theme")?.value;
  const initialTheme = storedTheme === "light" ? "light" : "dark";

  return (
    <html data-theme={initialTheme} lang="pt-BR" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <AppProviders>
          <div className="grain" />
          <GlobalThemeToggle />
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
