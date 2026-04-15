"use client";

import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/layout/theme-toggle";

export function GlobalThemeToggle() {
  const pathname = usePathname();

  if (pathname.startsWith("/dashboard")) {
    return null;
  }

  return <ThemeToggle />;
}
