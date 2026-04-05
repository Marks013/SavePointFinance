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

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  AUTH_TRUST_HOST: z.enum(["true", "false"]).default("false"),
  AUTOMATION_CRON_SECRET: z.string().min(1),
  HAIKU_ENABLED: z.enum(["true", "false"]).default("false"),
  HAIKU_API_KEY: z.string().optional(),
  HAIKU_MODEL: z.string().optional(),
  HAIKU_BASE_URL: optionalUrl,
  WHATSAPP_ASSISTANT_ENABLED: z.enum(["true", "false"]).default("false"),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_GRAPH_VERSION: z.string().default("v22.0"),
  WHATSAPP_APP_SECRET: z.string().optional(),
  EMAIL_PROVIDER: z.enum(["webhook", "resend", "brevo"]).default("webhook"),
  EMAIL_FROM: optionalString,
  EMAIL_FROM_NAME: optionalString,
  EMAIL_REPLY_TO: optionalString,
  RESEND_API_KEY: optionalString,
  BREVO_API_KEY: optionalString,
  NOTIFICATION_EMAIL_WEBHOOK_URL: optionalUrl,
  NOTIFICATION_WHATSAPP_WEBHOOK_URL: optionalUrl
});

export const serverEnv = serverEnvSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
  AUTOMATION_CRON_SECRET: process.env.AUTOMATION_CRON_SECRET,
  HAIKU_ENABLED: process.env.HAIKU_ENABLED,
  HAIKU_API_KEY: process.env.HAIKU_API_KEY,
  HAIKU_MODEL: process.env.HAIKU_MODEL,
  HAIKU_BASE_URL: process.env.HAIKU_BASE_URL,
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
  NOTIFICATION_WHATSAPP_WEBHOOK_URL: process.env.NOTIFICATION_WHATSAPP_WEBHOOK_URL
});
