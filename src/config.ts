import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(1),
  PORT: z.string().default("8080"),
  REDIS_URL: z.string().optional(),
  TELEGRAM_ADAPTER_MODE: z.enum(["auto", "webhook", "polling"]).default("webhook"),
  CURSOR_API_KEY: z.string().min(1),
  AGENT_WORKSPACE: z.string().min(1),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`invalid env: ${msg}`);
  }
  return parsed.data;
}
