import { z } from "zod";

export const accountTypeValues = ["checking", "savings", "investment", "wallet"] as const;

export const accountFormSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome"),
  type: z.enum(accountTypeValues).default("checking"),
  balance: z.coerce.number().default(0),
  currency: z.string().trim().length(3).default("BRL"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor invalida").default("#10B981"),
  institution: z.string().trim().optional().nullable()
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;
