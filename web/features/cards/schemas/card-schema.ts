import { z } from "zod";
import type { StatementMonthAnchor } from "@prisma/client";

export const statementMonthAnchorValues = ["close_month", "previous_month"] as const;
const MAX_DECIMAL_15_2 = 9_999_999_999_999.99;

export function deriveStatementMonthAnchor(closeDay: number, dueDay: number): StatementMonthAnchor {
  return closeDay < dueDay ? "previous_month" : "close_month";
}

export const cardFormSchema = z
  .object({
    name: z.string().trim().min(2, "Informe um nome"),
    brand: z.string().trim().min(2, "Informe a bandeira"),
    last4: z
      .string()
      .trim()
      .regex(/^\d{0,4}$/, "Use ate 4 digitos")
      .default(""),
    limitAmount: z.coerce.number().min(0).max(MAX_DECIMAL_15_2).default(0),
    dueDay: z.coerce.number().int().min(1).max(31).default(10),
    closeDay: z.coerce.number().int().min(1).max(31).default(3),
    statementMonthAnchor: z.enum(statementMonthAnchorValues).optional(),
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor invalida").default("#374151"),
    institution: z.string().trim().optional().nullable()
  })
  .transform((value) => ({
    ...value,
    statementMonthAnchor: deriveStatementMonthAnchor(value.closeDay, value.dueDay)
  }));

export type CardFormValues = z.infer<typeof cardFormSchema>;
