"use client";

import { MoonStar, SunMedium } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border transition-all duration-200 hover:-translate-y-0.5",
        compact
          ? "relative z-20 border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_92%,var(--color-muted))] px-3 py-2 text-xs text-[var(--color-foreground)] shadow-[0_12px_28px_rgba(15,23,42,0.18)] backdrop-blur-md"
          : "fixed right-5 top-5 z-[90] border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_92%,var(--color-muted))] px-4 py-2.5 text-sm text-[var(--color-foreground)] shadow-[0_18px_38px_rgba(15,23,42,0.16)] backdrop-blur-md"
      )}
      onClick={toggleTheme}
      type="button"
    >
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-[var(--color-primary)] text-[var(--color-primary-foreground)]">
        {theme === "light" ? <MoonStar className="size-3.5" /> : <SunMedium className="size-3.5" />}
      </span>
      <span>{theme === "light" ? "Dark" : "Claro"}</span>
    </button>
  );
}
