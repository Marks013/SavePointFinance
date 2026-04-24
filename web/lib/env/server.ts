import { z } from "zod";

const optionalUrl = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  },
  z.string().url().optional()
);

const optionalString = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  },
  z.string().optional()
);

const optionalPositiveNumber = z.preprocess(
  (value) => {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim();
    if (!normalized.length) {
      return undefined;
    }

    const parsed = Number(normalized.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : value;
  },
  z.number().positive().optional()
);

const serverEnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(1),
    AUTH_TRUST_HOST: z.enum(["true", "false"]).default("false"),
    AUTOMATION_CRON_SECRET: z.string().min(1),
    MAINTENANCE_MODE: z.enum(["true", "false"]).default("false"),
    GEMINI_ENABLED: z.enum(["true", "false"]).default("false"),
    GEMINI_API_KEY: optionalString,
    GEMINI_MODEL: optionalString,
    GEMINI_BASE_URL: optionalUrl,
    WHATSAPP_ASSISTANT_ENABLED: z.enum(["true", "false"]).default("false"),
    WHATSAPP_VERIFY_TOKEN: optionalString,
    WHATSAPP_ACCESS_TOKEN: optionalString,
    WHATSAPP_PHONE_NUMBER_ID: optionalString,
    WHATSAPP_GRAPH_VERSION: z.string().default("v22.0"),
    WHATSAPP_APP_SECRET: optionalString,
    EMAIL_PROVIDER: z.enum(["webhook", "resend", "brevo"]).default("webhook"),
    EMAIL_FROM: optionalString,
    EMAIL_FROM_NAME: optionalString,
    EMAIL_REPLY_TO: optionalString,
    RESEND_API_KEY: optionalString,
    BREVO_API_KEY: optionalString,
    NOTIFICATION_EMAIL_WEBHOOK_URL: optionalUrl,
    NOTIFICATION_WHATSAPP_WEBHOOK_URL: optionalUrl,
    MP_BILLING_ENABLED: z.enum(["true", "false"]).default("false"),
    MP_ACCESS_TOKEN: optionalString,
    MP_PUBLIC_KEY: optionalString,
    MP_WEBHOOK_SECRET: optionalString,
    MP_BILLING_PLAN_SLUG: z.string().default("premium-completo"),
    MP_BILLING_REASON: z.string().default("Save Point Financa Premium"),
    MP_BILLING_AMOUNT: optionalPositiveNumber,
    MP_BILLING_ANNUAL_AMOUNT: optionalPositiveNumber,
    MP_BILLING_ANNUAL_MAX_INSTALLMENTS: z.coerce.number().int().positive().default(12),
    MP_BILLING_CURRENCY: z.string().default("BRL"),
    MP_BILLING_FREQUENCY: z.coerce.number().int().positive().default(1),
    MP_BILLING_FREQUENCY_TYPE: z.string().default("months")
  })
  .superRefine((value, context) => {
    if (value.WHATSAPP_ASSISTANT_ENABLED === "true") {
      for (const key of [
        "WHATSAPP_VERIFY_TOKEN",
        "WHATSAPP_ACCESS_TOKEN",
        "WHATSAPP_PHONE_NUMBER_ID",
        "WHATSAPP_APP_SECRET"
      ] as const) {
        if (!value[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when WHATSAPP_ASSISTANT_ENABLED=true`
          });
        }
      }
    }

    if (value.MP_BILLING_ENABLED === "true") {
      for (const key of ["MP_ACCESS_TOKEN", "MP_PUBLIC_KEY", "MP_WEBHOOK_SECRET"] as const) {
        if (!value[key]) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when MP_BILLING_ENABLED=true`
          });
        }
      }
    }
  });

export const serverEnv = serverEnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
  AUTOMATION_CRON_SECRET: process.env.AUTOMATION_CRON_SECRET,
  MAINTENANCE_MODE: process.env.MAINTENANCE_MODE,
  GEMINI_ENABLED: process.env.GEMINI_ENABLED,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_BASE_URL: process.env.GEMINI_BASE_URL,
  WHATSAPP_ASSISTANT_ENABLED: process.env.WHATSAPP_ASSISTANT_ENABLED,
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_GRAPH_VERSION: process.env.WHATSAPP_GRAPH_VERSION,
  WHATSAPP_APP_SECRET: process.env.WHATSAPP_APP_SECRET,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  NOTIFICATION_EMAIL_WEBHOOK_URL: process.env.NOTIFICATION_EMAIL_WEBHOOK_URL,
  NOTIFICATION_WHATSAPP_WEBHOOK_URL: process.env.NOTIFICATION_WHATSAPP_WEBHOOK_URL,
  MP_BILLING_ENABLED: process.env.MP_BILLING_ENABLED,
  MP_ACCESS_TOKEN: process.env.MP_ACCESS_TOKEN,
  MP_PUBLIC_KEY: process.env.MP_PUBLIC_KEY,
  MP_WEBHOOK_SECRET: process.env.MP_WEBHOOK_SECRET,
  MP_BILLING_PLAN_SLUG: process.env.MP_BILLING_PLAN_SLUG,
  MP_BILLING_REASON: process.env.MP_BILLING_REASON,
  MP_BILLING_AMOUNT: process.env.MP_BILLING_AMOUNT,
  MP_BILLING_ANNUAL_AMOUNT: process.env.MP_BILLING_ANNUAL_AMOUNT,
  MP_BILLING_ANNUAL_MAX_INSTALLMENTS: process.env.MP_BILLING_ANNUAL_MAX_INSTALLMENTS,
  MP_BILLING_CURRENCY: process.env.MP_BILLING_CURRENCY,
  MP_BILLING_FREQUENCY: process.env.MP_BILLING_FREQUENCY,
  MP_BILLING_FREQUENCY_TYPE: process.env.MP_BILLING_FREQUENCY_TYPE
});
