import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
  TELEGRAM_BOT_USERNAME: z.string().min(1),
  TELEGRAM_WEBHOOK_SECRET_TOKEN: z.string().min(1),
  WEBHOOK_SECRET: z.string().min(1),
  PORT: z.string().default("8080"),
  TELEGRAM_ADAPTER_MODE: z.enum(["auto", "webhook", "polling"]).default("webhook"),
  CURSOR_API_KEY: z.string().min(1),
  AGENT_WORKSPACE: z.string().min(1),
  /** e.g. `http://coolify:8000` — Coolify HTTP API origin (no `/api/v1` suffix). */
  COOLIFY_API_ORIGIN: z.string().optional(),
  /** Bearer token from Coolify Keys & Tokens (prefer read-only until write tools exist). */
  COOLIFY_API_TOKEN: z.string().optional(),
  /** Sentinel HTTP origin e.g. `http://host:8080` (paths use `/api/...`). */
  SENTINEL_BASE_URL: z.string().optional(),
  SENTINEL_TOKEN: z.string().optional(),
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
