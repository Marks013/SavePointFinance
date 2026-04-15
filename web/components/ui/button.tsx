import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full border text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[linear-gradient(135deg,var(--color-primary)_0%,color-mix(in_srgb,var(--color-primary)_78%,white)_100%)] px-5 py-3 text-[var(--color-primary-foreground)] shadow-[0_18px_40px_rgba(19,111,79,0.24)] hover:-translate-y-0.5 hover:shadow-[0_22px_50px_rgba(19,111,79,0.28)]",
        secondary:
          "border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_82%,transparent)] px-5 py-3 text-[var(--color-secondary-foreground)] shadow-[0_10px_24px_rgba(15,23,42,0.08)] backdrop-blur-md hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--color-primary)_36%,var(--color-border))] hover:bg-[color-mix(in_srgb,var(--color-card)_74%,var(--color-muted))]",
        ghost:
          "border-transparent bg-transparent px-4 py-2.5 text-[var(--color-foreground)] hover:bg-[color-mix(in_srgb,var(--color-foreground)_6%,transparent)]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ asChild, className, variant, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return <Comp className={cn(buttonVariants({ variant }), className)} {...props} />;
}
