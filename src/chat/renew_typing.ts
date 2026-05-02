import type { Thread } from "chat";
import type { ThreadState } from "./cursor_bridge.js";

const TELEGRAM_TYPING_TTL_MS = 4000;

/** Telegram clears typing after ~5s; refresh while work runs (e.g. long Cursor runs). */
export async function withRenewingTyping<T>(
  thread: Thread<ThreadState>,
  fn: () => Promise<T>,
): Promise<T> {
  await thread.startTyping();
  const timer = setInterval(() => {
    void thread.startTyping();
  }, TELEGRAM_TYPING_TTL_MS);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
  }
}
