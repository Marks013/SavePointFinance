"use client";

import { useState } from "react";
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

function formatBlurredCurrencyValue(value: unknown, nullable: boolean) {
  if (typeof value === "number") {
    return formatCurrencyInputValue(value);
  }

  return nullable ? "" : formatCurrencyInputValue(0);
}

function formatFocusedCurrencyValue(value: unknown, nullable: boolean) {
  if (typeof value === "number") {
    return !nullable && value === 0 ? "" : formatEditableCurrencyValue(value);
  }

  return "";
}

type CurrencyInputProps<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues
> = {
  control: Control<TFieldValues, unknown, TTransformedValues>;
  name: FieldPath<TFieldValues>;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  nullable?: boolean;
};

export function CurrencyInput<
  TFieldValues extends FieldValues,
  TTransformedValues extends FieldValues = TFieldValues
>({
  control,
  name,
  id,
  placeholder,
  disabled,
  nullable = false
}: CurrencyInputProps<TFieldValues, TTransformedValues>) {
  const { field } = useController<TFieldValues, FieldPath<TFieldValues>, TTransformedValues>({ control, name });
  const [isFocused, setIsFocused] = useState(false);
  const [displayValue, setDisplayValue] = useState(() => formatFocusedCurrencyValue(field.value, nullable));
  const inputValue = isFocused ? displayValue : formatBlurredCurrencyValue(field.value, nullable);

  return (
    <Input
      disabled={disabled}
      id={id}
      inputMode="decimal"
      placeholder={placeholder}
      value={inputValue}
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
        const nextDisplay = formatFocusedCurrencyValue(field.value, nullable);
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
