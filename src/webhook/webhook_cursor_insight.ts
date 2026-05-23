import { Agent, CursorAgentError } from "@cursor/sdk";
import type { CoolifyEvent } from "../coolify/event.js";
import { WEBHOOK_CURSOR_MODEL_IDS } from "../cursor/models.js";
import { esc, truncate } from "../telegram/html.js";

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_INSIGHT_CHARS = 320;

function buildInsightPrompt(ev: CoolifyEvent, raw: string): string {
  const payload = truncate(raw, 4000);
  return [
    "You are coolify-doctor writing a one-line Telegram note for an operator.",
    "Given this Coolify webhook JSON, add at most 2 short sentences of useful context (what likely happened, what to check next).",
    "Do not use tools. Do not use markdown, bullets, or HTML. Plain text only. Stay under 280 characters.",
    `Event type: ${ev.event}`,
    `Success: ${ev.success}`,
    `Message field: ${ev.message || "(empty)"}`,
    "---",
    payload,
  ].join("\n");
}

function normalizeInsight(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return truncate(oneLine, MAX_INSIGHT_CHARS);
}

async function runInsightPrompt(
  prompt: string,
  modelId: (typeof WEBHOOK_CURSOR_MODEL_IDS)[number],
  opts: { apiKey: string; cwd: string },
): Promise<string | undefined> {
  const result = await Agent.prompt(prompt, {
    apiKey: opts.apiKey,
    model: { id: modelId },
    local: { cwd: opts.cwd, settingSources: [] },
  });
  if (result.status !== "finished" || !result.result?.trim()) {
    console.warn(
      "webhook insight: model=%s run=%s status=%s",
      modelId,
      result.id,
      result.status,
    );
    return undefined;
  }
  return normalizeInsight(result.result);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`insight timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export type WebhookInsightOpts = {
  apiKey: string;
  cwd: string;
  timeoutMs?: number;
};

/** Brief Cursor-generated context for a Coolify webhook, or undefined on failure. */
export async function getWebhookInsight(
  ev: CoolifyEvent,
  raw: string,
  opts: WebhookInsightOpts,
): Promise<string | undefined> {
  const prompt = buildInsightPrompt(ev, raw);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let i = 0; i < WEBHOOK_CURSOR_MODEL_IDS.length; i++) {
    const modelId = WEBHOOK_CURSOR_MODEL_IDS[i]!;
    const isLast = i === WEBHOOK_CURSOR_MODEL_IDS.length - 1;
    try {
      const insight = await withTimeout(runInsightPrompt(prompt, modelId, opts), timeoutMs);
      if (insight) {
        console.info("webhook insight: model=%s len=%s", modelId, insight.length);
        return insight;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof CursorAgentError && !isLast) {
        console.warn("webhook insight: model=%s failed (%s), trying fallback", modelId, msg);
        continue;
      }
      console.warn("webhook insight: model=%s failed:", modelId, msg);
      if (!isLast) continue;
    }
  }
  return undefined;
}

export function appendInsightHtml(baseHtml: string, insight: string): string {
  return `${baseHtml}\n\n💡 <i>${esc(insight)}</i>`;
}
