import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { Chat, type MessageContext } from "chat";
import type { Config } from "../config.js";
import { runCursorOnThread, type ThreadState } from "./cursor_bridge.js";

function createStateAdapter(cfg: Config) {
  if (cfg.REDIS_URL) {
    return createRedisState({ url: cfg.REDIS_URL });
  }
  return createMemoryState();
}

export function createChatBot(cfg: Config) {
  const state = createStateAdapter(cfg);
  const telegram = createTelegramAdapter({ mode: cfg.TELEGRAM_ADAPTER_MODE });

  const bot = new Chat({
    userName: cfg.TELEGRAM_BOT_USERNAME,
    adapters: { telegram },
    state,
    concurrency: "queue",
    logger: "warn",
  });

  const allowedChatId = cfg.TELEGRAM_CHAT_ID;

  function allowedChannel(threadChannelId: string): boolean {
    return threadChannelId === allowedChatId;
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

  bot.onNewMention(async (thread, message, context) => {
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
    await thread.startTyping();
    const prompt = buildPrompt(message.text, context);
    await runCursorOnThread(thread, prompt, {
      apiKey: cfg.CURSOR_API_KEY,
      cwd: cfg.AGENT_WORKSPACE,
    });
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
    await thread.startTyping();
    const prompt = buildPrompt(message.text, context);
    await runCursorOnThread(thread, prompt, {
      apiKey: cfg.CURSOR_API_KEY,
      cwd: cfg.AGENT_WORKSPACE,
    });
  });

  return { bot, state };
}
