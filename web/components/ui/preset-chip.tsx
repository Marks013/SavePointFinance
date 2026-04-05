import { cn } from "@/lib/utils";

type PresetChipProps = {
  label: string;
  shortLabel: string;
  color: string;
  background: string;
  description?: string;
  active?: boolean;
  compact?: boolean;
  swatchOnly?: boolean;
};

function isDarkColor(color: string) {
  const normalized = color.replace("#", "").trim();
  if (!(normalized.length === 6 || normalized.length === 3)) {
    return false;
  }

  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  if ([red, green, blue].some(Number.isNaN)) {
    return false;
  }

  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance < 0.26;
}

export function PresetChip({
  label,
  shortLabel,
  color,
  background,
  description,
  active = false,
  compact = false,
  swatchOnly = false
}: PresetChipProps) {
  const darkTone = isDarkColor(color);
  const textColor = darkTone ? "var(--color-foreground)" : color;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition",
        active ? "border-[var(--color-foreground)] shadow-[0_10px_24px_rgba(15,23,42,0.08)]" : "border-transparent",
        swatchOnly ? "justify-center rounded-full px-2 py-2" : ""
      )}
      style={{
        color: textColor,
        backgroundColor: background
      }}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold",
          darkTone ? "ring-1 ring-white/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" : "",
          swatchOnly ? "size-8" : compact ? "size-7 text-[11px]" : "size-8 text-xs"
        )}
        style={{
          color: "#fff",
          backgroundColor: color
        }}
      >
        {swatchOnly ? null : shortLabel}
      </span>
      {!swatchOnly ? (
        <span className="flex flex-col leading-tight">
          <span>{label}</span>
          {description && !compact ? <span className="text-[11px] opacity-80">{description}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
