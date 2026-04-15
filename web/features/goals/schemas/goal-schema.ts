import { z } from "zod";

import { optionalDateKeySchema } from "@/lib/date";

export const goalFormSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome"),
  targetAmount: z.coerce.number().positive("Informe um valor alvo"),
  currentAmount: z.coerce.number().min(0).default(0),
  deadline: optionalDateKeySchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor invalida").default("#3B82F6"),
  icon: z.string().trim().optional().nullable(),
  accountId: z.string().optional().nullable()
});

export type GoalFormValues = z.infer<typeof goalFormSchema>;
