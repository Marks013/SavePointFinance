import { cn } from "@/lib/utils";

type BrandMarkProps = {
  inverted?: boolean;
  compact?: boolean;
  className?: string;
};

export function BrandMark({ inverted = false, compact = false, className }: BrandMarkProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-[1.35rem] border shadow-[0_20px_42px_rgba(19,111,79,0.18)]",
          compact ? "size-11" : "size-14",
          inverted
            ? "border-white/16 bg-[linear-gradient(145deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.06)_100%)] text-white"
            : "border-[rgba(19,111,79,0.18)] bg-[linear-gradient(145deg,#163229_0%,#1d6a4d_58%,#d97b55_100%)] text-white"
        )}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),transparent_48%)]" />
        <div className="absolute inset-[18%] rounded-[1rem] border border-white/12" />
        <div className="absolute -right-2 -top-2 size-7 rounded-full bg-white/18 blur-md" />
        <div className="absolute -bottom-3 left-1 size-8 rounded-full bg-[rgba(217,123,85,0.34)] blur-md" />
        <span
          className={cn(
            "relative font-semibold tracking-[-0.1em]",
            compact ? "text-[1.02rem]" : "text-[1.28rem]"
          )}
        >
          S•
        </span>
      </div>
      {compact ? (
        <div className="min-w-0">
          <p
            className={cn(
              "text-[0.9rem] font-semibold tracking-[-0.035em]",
              inverted ? "text-white" : "text-[var(--color-foreground)]"
            )}
          >
            Save Point Finança
          </p>
          <p
            className={cn(
              "mt-0.5 text-[0.63rem] font-medium uppercase leading-5 tracking-[0.12em]",
              inverted ? "text-white/66" : "text-[var(--color-muted-foreground)]"
            )}
          >
            Controle operacional
          </p>
        </div>
      ) : (
        <div className="min-w-0">
          <p
            className={cn(
              "font-semibold",
              "text-[0.78rem] tracking-[0.12em] uppercase",
              inverted ? "text-white/66" : "text-[var(--color-muted-foreground)]"
            )}
          >
            Save Point Finança
          </p>
          <p
            className={cn(
              "font-semibold tracking-[-0.05em] leading-tight",
              "text-[1.55rem]",
              inverted ? "text-white" : "text-[var(--color-foreground)]"
            )}
          >
            Inteligência financeira diária
          </p>
        </div>
      )}
    </div>
  );
}
