import { serve } from "@hono/node-server";
import { Hono } from "hono";
import type { RedisStateAdapter } from "@chat-adapter/state-redis";
import { loadConfig } from "./config.js";
import { createChatBot } from "./chat/create_bot.js";
import { sendTelegramHtml } from "./notify/telegram_send_html.js";
import { handleCoolifyWebhook } from "./webhook/coolify_webhook.js";

const cfg = loadConfig();
const { bot: chatBot, state } = createChatBot(cfg);

await state.connect();
const pong = await (state as RedisStateAdapter).getClient().ping();
console.log("chat state backend: redis ping =", pong);

const app = new Hono();

app.get("/health", (c) => c.text("ok"));

app.post("/webhook/:secret", async (c) => {
  const secret = c.req.param("secret");
  return handleCoolifyWebhook(secret, cfg.WEBHOOK_SECRET, c.req.raw, {
    sender: {
      sendHTML: (html: string) =>
        sendTelegramHtml(cfg.TELEGRAM_BOT_TOKEN, cfg.TELEGRAM_CHAT_ID, html),
    },
    insight: {
      apiKey: cfg.CURSOR_API_KEY,
      cwd: cfg.AGENT_WORKSPACE,
    },
  });
});

app.post("/webhooks/telegram", (c) => {
  console.info("[telegram] webhook POST");
  return chatBot.webhooks.telegram(c.req.raw, {
    waitUntil: (task) => {
      task
        .then(() => console.info("[telegram] update handler finished"))
        .catch((err) => console.error("[telegram] update handler error:", err));
    },
  });
});

const port = Number.parseInt(cfg.PORT, 10) || 8080;

await chatBot.initialize();
console.log("chat instance ready (adapters initialized)");

console.log("coolify-doctor listening on :" + port);
serve({ fetch: app.fetch, port });
