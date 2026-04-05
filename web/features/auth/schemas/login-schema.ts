import { z } from "zod";

export const loginSchema = z.object({
  email: z.email("Informe um e-mail valido"),
  password: z.string().min(8, "Informe ao menos 8 caracteres")
});

export type LoginSchema = z.infer<typeof loginSchema>;
