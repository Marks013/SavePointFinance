import * as LabelPrimitive from "@radix-ui/react-label";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      className={cn("text-[0.84rem] font-medium tracking-[0.01em] text-[var(--color-muted-foreground)]", className)}
      {...props}
    />
  );
}
