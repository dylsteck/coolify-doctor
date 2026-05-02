import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { Chat, type Message, type MessageContext, type Thread } from "chat";
import type { Config } from "../config.js";
import { runCursorOnThread, type ThreadState } from "./cursor_bridge.js";
import { isAllowedTelegramChat } from "./telegram_allowlist.js";
import { withRenewingTyping } from "./renew_typing.js";

/** In Docker, entrypoint starts Redis here before Node. Local dev: run Redis on 6379 or use Docker. */
const CHAT_REDIS_URL = "redis://127.0.0.1:6379";

const HELP_TEXT = [
  "**coolify-doctor** (Telegram + Cursor)",
  "",
  "**help** — this message",
  "**clear** — forget the saved Cursor agent for this thread (fresh session on next message)",
  "**stop** — unsubscribe this thread (groups: @mention again to resume)",
  "",
  "Groups: @mention the bot to start. DMs: write normally.",
  "Deploy alerts use Coolify → `/webhook/…` separately from this chat.",
  "",
  "The agent is steered to be **read-mostly** and avoid destructive actions unless you clearly ask.",
].join("\n");

function commandWord(text: string): string {
  return text.trim().toLowerCase();
}

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
      console.warn(
        "[telegram] allowlist reject channelId=%s (raw=%s) TELEGRAM_CHAT_ID=%s",
        thread.channelId,
        thread.channelId.replace(/^telegram:/, ""),
        allowedChatId,
      );
      await thread.post("This bot only responds in the configured admin chat.");
      return;
    }
    console.info("[telegram] new conversation thread=%s text_len=%s", thread.id, message.text.length);
    const cmd = commandWord(message.text);
    if (cmd === "help") {
      await thread.post({ markdown: HELP_TEXT });
      return;
    }
    if (cmd === "clear") {
      // New Telegram thread semantics = new Cursor session: drop stored agent id so we Agent.create instead of resume.
      await thread.setState({}, { replace: true });
      await thread.post("Context cleared. Next message starts a new Cursor agent (no resume).");
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
      console.warn(
        "[telegram] DM ignored (wrong chat) channelId=%s TELEGRAM_CHAT_ID=%s",
        thread.channelId,
        allowedChatId,
      );
      return;
    }
    await handleNewConversation(thread, message, context);
  });

  bot.onSubscribedMessage(async (thread, message, context) => {
    if (!allowedChannel(thread.channelId)) {
      console.warn(
        "[telegram] subscribed msg ignored (wrong chat) channelId=%s TELEGRAM_CHAT_ID=%s",
        thread.channelId,
        allowedChatId,
      );
      return;
    }
    console.info("[telegram] subscribed message thread=%s text_len=%s", thread.id, message.text.length);
    const cmd = commandWord(message.text);
    if (cmd === "stop") {
      await thread.unsubscribe();
      await thread.post("Stopped watching this thread.");
      return;
    }
    if (cmd === "help") {
      await thread.post({ markdown: HELP_TEXT });
      return;
    }
    if (cmd === "clear") {
      // New Telegram thread semantics = new Cursor session: drop stored agent id so we Agent.create instead of resume.
      await thread.setState({}, { replace: true });
      await thread.post("Context cleared. Next message starts a new Cursor agent (no resume).");
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
