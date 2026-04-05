"use client";

import { useEffect, useState } from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { useController } from "react-hook-form";

import { Input } from "@/components/ui/input";

function formatCurrencyInputValue(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value ?? 0);
}

function parseCurrencyInputValue(raw: string) {
  const sanitized = raw.replace(/[^\d,.-]/g, "").replace(/-/g, "").trim();

  if (!sanitized) {
    return null;
  }

  let normalized = sanitized;

  if (sanitized.includes(",")) {
    normalized = sanitized.replace(/\./g, "").replace(",", ".");
  } else {
    const dotMatches = sanitized.match(/\./g) ?? [];
    normalized =
      dotMatches.length === 1 && /\.\d{1,2}$/.test(sanitized) ? sanitized : sanitized.replace(/\./g, "");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

type CurrencyInputProps<TFieldValues extends FieldValues> = {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  nullable?: boolean;
};

export function CurrencyInput<TFieldValues extends FieldValues>({
  control,
  name,
  id,
  placeholder,
  disabled,
  nullable = false
}: CurrencyInputProps<TFieldValues>) {
  const { field } = useController({ control, name });
  const [displayValue, setDisplayValue] = useState(() =>
    formatCurrencyInputValue(typeof field.value === "number" ? field.value : 0)
  );

  useEffect(() => {
    if (typeof field.value === "number") {
      setDisplayValue(formatCurrencyInputValue(field.value));
      return;
    }

    if (field.value == null && nullable) {
      setDisplayValue("");
    }
  }, [field.value, nullable]);

  return (
    <Input
      disabled={disabled}
      id={id}
      inputMode="decimal"
      placeholder={placeholder}
      value={displayValue}
      onBlur={field.onBlur}
      onChange={(event) => {
        const raw = event.target.value;
        const parsed = parseCurrencyInputValue(raw);

        if (parsed === null) {
          setDisplayValue("");
          field.onChange(nullable ? null : 0);
          return;
        }

        setDisplayValue(formatCurrencyInputValue(parsed));
        field.onChange(parsed);
      }}
    />
  );
}
