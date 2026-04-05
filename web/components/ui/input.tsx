import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "flex h-12 w-full rounded-[1.15rem] border border-[var(--color-border)] bg-[var(--color-input)] px-4 py-3 text-sm text-[var(--color-foreground)] outline-none transition duration-200 placeholder:text-[color-mix(in_srgb,var(--color-muted-foreground)_84%,transparent)] focus:border-[var(--color-primary)] focus:bg-[var(--color-card)] focus:ring-4 focus:ring-[var(--color-ring)]/12",
        className
      )}
      {...props}
    />
  );
}
