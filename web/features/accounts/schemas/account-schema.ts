import { z } from "zod";

export const accountTypeValues = ["checking", "savings", "investment", "wallet"] as const;
export const accountUsageValues = ["standard", "benefit_food"] as const;

export const accountFormSchema = z.object({
  name: z.string().trim().min(2, "Informe um nome"),
  type: z.enum(accountTypeValues).default("checking"),
  usage: z.enum(accountUsageValues).default("standard"),
  balance: z.coerce.number().default(0),
  currency: z.string().trim().length(3).default("BRL"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor invalida").default("#10B981"),
  institution: z.string().trim().optional().nullable()
}).superRefine((value, ctx) => {
  if (value.usage === "benefit_food" && value.type !== "wallet") {
    ctx.addIssue({
      code: "custom",
      path: ["type"],
      message: "Vale Alimentacao deve usar o tipo carteira"
    });
  }
});

export type AccountFormValues = z.infer<typeof accountFormSchema>;
