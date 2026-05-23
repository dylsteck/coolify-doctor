/** Default model for conversational Telegram agents. */
export const CURSOR_MODEL_ID = "composer-2.5" as const;

/** One-shot webhook insight: prefer auto routing, fall back to {@link CURSOR_MODEL_ID}. */
export const WEBHOOK_CURSOR_MODEL_IDS = ["auto", CURSOR_MODEL_ID] as const;
