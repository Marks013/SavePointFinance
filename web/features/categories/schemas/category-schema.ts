import { z } from "zod";

export const categoryTypeValues = ["income", "expense"] as const;

export const categoryFormSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome"),
  icon: z.string().trim().min(1).default("tag"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor invalida").default("#6B7280"),
  type: z.enum(categoryTypeValues).default("expense"),
  monthlyLimit: z.coerce.number().min(0, "Informe um limite válido").optional().nullable(),
  keywords: z.string().default("")
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
