import { z } from "zod";

export const cardFormSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome"),
  brand: z.string().trim().min(2, "Informe a bandeira"),
  last4: z
    .string()
    .trim()
    .regex(/^\d{0,4}$/, "Use ate 4 digitos")
    .default(""),
  limitAmount: z.coerce.number().min(0).default(0),
  dueDay: z.coerce.number().int().min(1).max(31).default(10),
  closeDay: z.coerce.number().int().min(1).max(31).default(3),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor invalida").default("#374151"),
  institution: z.string().trim().optional().nullable()
});

export type CardFormValues = z.infer<typeof cardFormSchema>;
