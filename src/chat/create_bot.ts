import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { Chat, type Message, type MessageContext, type Thread } from "chat";
import type { Config } from "../config.js";
import { runCursorOnThread, type ThreadState } from "./cursor_bridge.js";
import { isAllowedTelegramChat } from "./telegram_allowlist.js";
import { withRenewingTyping } from "./renew_typing.js";

/** In Docker, entrypoint starts Redis here before Node. Local dev: run Redis on 6379 or use Docker. */
const CHAT_REDIS_URL = "redis://127.0.0.1:6379";

export function createChatBot(cfg: Config) {
  const state = createRedisState({ url: CHAT_REDIS_URL });
  const telegram = createTelegramAdapter({ mode: cfg.TELEGRAM_ADAPTER_MODE });

  const bot = new Chat({
    userName: cfg.TELEGRAM_BOT_USERNAME,
    adapters: { telegram },
    state,
    concurrency: "queue",
    logger: "warn",
  });

  const allowedChatId = cfg.TELEGRAM_CHAT_ID;

  function allowedChannel(channelId: string): boolean {
    return isAllowedTelegramChat(channelId, allowedChatId);
  }

  function buildPrompt(text: string, context?: MessageContext): string {
    if (context?.skipped?.length) {
      const n = context.totalSinceLastHandler ?? context.skipped.length + 1;
      return (
        `(You received ${n} messages while busy; this is the latest.)\n\n` +
        [...context.skipped.map((m) => m.text), text].join("\n\n---\n\n")
      );
    }
    return text;
  }

  async function handleNewConversation(thread: Thread<ThreadState>, message: Message, context?: MessageContext) {
    if (!allowedChannel(thread.channelId)) {
      await thread.post("This bot only responds in the configured admin chat.");
      return;
    }
    await thread.subscribe();
    if (context?.skipped?.length) {
      await thread.post(
        `You sent ${context.totalSinceLastHandler} messages while I was starting. Responding to your latest.`,
      );
    }
    const prompt = buildPrompt(message.text, context);
    await withRenewingTyping(thread, () =>
      runCursorOnThread(thread, prompt, {
        apiKey: cfg.CURSOR_API_KEY,
        cwd: cfg.AGENT_WORKSPACE,
      }),
    );
  }

  /** Groups / channels: first ping is usually an @mention. */
  bot.onNewMention(async (thread, message, context) => {
    await handleNewConversation(thread, message, context);
  });

  /** Private chat with the bot: first messages are not @mentions, so use this handler. */
  bot.onDirectMessage(async (thread, message, _channel, context) => {
    if (!allowedChannel(thread.channelId)) {
      return;
    }
    await handleNewConversation(thread, message, context);
  });

  bot.onSubscribedMessage(async (thread, message, context) => {
    if (!allowedChannel(thread.channelId)) {
      return;
    }
    if (message.text.trim().toLowerCase() === "stop") {
      await thread.unsubscribe();
      await thread.post("Stopped watching this thread.");
      return;
    }
    if (context?.skipped?.length) {
      await thread.post(
        `You sent ${context.totalSinceLastHandler} messages while I was thinking. Responding to your latest.`,
      );
    }
    const prompt = buildPrompt(message.text, context);
    await withRenewingTyping(thread, () =>
      runCursorOnThread(thread, prompt, {
        apiKey: cfg.CURSOR_API_KEY,
        cwd: cfg.AGENT_WORKSPACE,
      }),
    );
  });

  return { bot, state };
}
