import type { CoolifyEvent } from "../coolify/event.js";
import { formatEvent } from "../coolify/format.js";
import { secretsEqual } from "./secrets.js";

export const MAX_BODY = 1 << 20;

export type HtmlSender = {
  sendHTML(html: string): Promise<void>;
};

export async function handleCoolifyWebhook(
  secret: string,
  expectedSecret: string,
  request: Request,
  sender: HtmlSender,
): Promise<Response> {
  if (!secretsEqual(expectedSecret, secret)) {
    return new Response("unauthorized", { status: 401 });
  }

  let body: ArrayBuffer;
  try {
    body = await readLimitedBody(request, MAX_BODY);
  } catch (e) {
    console.warn("webhook: read body:", e);
    return new Response(null, { status: 200 });
  }

  const text = new TextDecoder().decode(body);
  let ev: CoolifyEvent;
  try {
    ev = JSON.parse(text) as CoolifyEvent;
  } catch (e) {
    console.warn("webhook: decode failed:", e, "raw=", text);
    return new Response(null, { status: 200 });
  }

  const html = formatEvent(ev, text);
  console.log("webhook: event=%s success=%s", ev.event, ev.success);
  try {
    await sender.sendHTML(html);
  } catch (e) {
    console.warn("telegram send:", e);
  }
  return new Response(null, { status: 200 });
}

async function readLimitedBody(request: Request, max: number): Promise<ArrayBuffer> {
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      throw new Error("body too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out.buffer;
}
