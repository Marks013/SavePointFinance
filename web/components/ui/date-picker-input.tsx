"use client";

import { CalendarDays } from "lucide-react";
import { forwardRef, useMemo, useRef } from "react";
import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import { formatDateDisplay } from "@/lib/date";

type DatePickerInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  type?: "date" | "month";
};

function formatDisplayValue(type: "date" | "month", value?: string) {
  if (!value) {
    return type === "month" ? "Selecione a competência" : "Selecione a data";
  }

  if (type === "month") {
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric"
    }).format(new Date(`${value}-01T12:00:00`));
  }

  return formatDateDisplay(new Date(`${value}T12:00:00`));
}

export const DatePickerInput = forwardRef<HTMLInputElement, DatePickerInputProps>(function DatePickerInput(
  { className, disabled, readOnly, type = "date", value, ...props },
  ref
) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const displayValue = useMemo(() => formatDisplayValue(type, typeof value === "string" ? value : ""), [type, value]);

  const setRefs = (node: HTMLInputElement | null) => {
    innerRef.current = node;

    if (typeof ref === "function") {
      ref(node);
      return;
    }

    if (ref) {
      ref.current = node;
    }
  };

  const openPicker = () => {
    if (disabled || readOnly) {
      return;
    }

    innerRef.current?.focus();
    if ("showPicker" in HTMLInputElement.prototype) {
      innerRef.current?.showPicker();
    }
  };

  return (
    <div
      className={cn(
        "relative flex h-12 w-full items-center justify-between rounded-[1.15rem] border border-[var(--color-border)] bg-[var(--color-input)] px-4 py-3 text-left text-sm text-[var(--color-foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_20px_rgba(0,0,0,0.08)] outline-none transition duration-200",
        disabled ? "cursor-not-allowed opacity-70" : "hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-card)]",
        className
      )}
      onClick={openPicker}
    >
      <span className={cn("truncate pr-3 capitalize", !value && "text-[var(--color-muted-foreground)]")}>
        {displayValue}
      </span>
      <CalendarDays className="shrink-0 text-[var(--color-muted-foreground)]" />
      <input
        {...props}
        className={cn(
          "absolute inset-0 h-full w-full opacity-0",
          disabled || readOnly ? "pointer-events-none" : "cursor-pointer"
        )}
        disabled={disabled}
        readOnly={readOnly}
        ref={setRefs}
        type={type}
        value={value}
      />
    </div>
  );
});
