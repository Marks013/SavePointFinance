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

function formatEditableCurrencyValue(value: number | null | undefined) {
  if (value == null) {
    return "";
  }

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
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
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(() => {
    if (typeof field.value === "number") {
      return formatCurrencyInputValue(field.value);
    }

    return nullable ? "" : formatCurrencyInputValue(0);
  });

  useEffect(() => {
    if (isFocused) {
      return;
    }

    if (typeof field.value === "number") {
      setDisplayValue(formatCurrencyInputValue(field.value));
      return;
    }

    if (field.value == null && nullable) {
      setDisplayValue("");
      return;
    }

    if (field.value == null) {
      setDisplayValue(formatCurrencyInputValue(0));
    }
  }, [field.value, isFocused, nullable]);

  return (
    <Input
      disabled={disabled}
      id={id}
      inputMode="decimal"
      placeholder={placeholder}
      value={displayValue}
      onBlur={() => {
        setIsFocused(false);
        const parsed = parseCurrencyInputValue(displayValue);

        if (parsed === null) {
          setDisplayValue(nullable ? "" : formatCurrencyInputValue(0));
          field.onChange(nullable ? null : 0);
          field.onBlur();
          return;
        }

        setDisplayValue(formatCurrencyInputValue(parsed));
        field.onChange(parsed);
        field.onBlur();
      }}
      onFocus={(event) => {
        setIsFocused(true);
        const inputElement = event.currentTarget;
        const parsed = parseCurrencyInputValue(displayValue);
        const nextDisplay =
          parsed === null || (!nullable && parsed === 0) ? "" : formatEditableCurrencyValue(parsed);
        setDisplayValue(nextDisplay);
        queueMicrotask(() => {
          if (nextDisplay && inputElement.ownerDocument.activeElement === inputElement) {
            inputElement.select();
          }
        });
      }}
      onChange={(event) => {
        const raw = event.target.value;
        const parsed = parseCurrencyInputValue(raw);

        if (parsed === null) {
          setDisplayValue(raw.replace(/[^\d,.-]/g, ""));
          field.onChange(nullable ? null : 0);
          return;
        }

        setDisplayValue(raw.replace(/[^\d,.-]/g, ""));
        field.onChange(parsed);
      }}
    />
  );
}
