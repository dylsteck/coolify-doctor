import { describe, expect, it, vi } from "vitest";
import { handleCoolifyWebhook } from "./coolify_webhook.js";

describe("handleCoolifyWebhook", () => {
  it("401 when secret mismatch", async () => {
    const res = await handleCoolifyWebhook(
      "bad",
      "good",
      new Request("http://localhost/webhook/bad", { method: "POST", body: "{}" }),
      { sendHTML: async () => {} },
    );
    expect(res.status).toBe(401);
  });

  it("200 and sends on valid secret", async () => {
    const sendHTML = vi.fn().mockResolvedValue(undefined);
    const body = JSON.stringify({ success: true, event: "test", message: "x" });
    const res = await handleCoolifyWebhook(
      "sec",
      "sec",
      new Request("http://localhost/webhook/sec", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
      }),
      { sendHTML },
    );
    expect(res.status).toBe(200);
    expect(sendHTML).toHaveBeenCalledTimes(1);
  });

  it("200 and no send on bad json", async () => {
    const sendHTML = vi.fn();
    const res = await handleCoolifyWebhook(
      "sec",
      "sec",
      new Request("http://localhost/webhook/sec", { method: "POST", body: "not json" }),
      { sendHTML },
    );
    expect(res.status).toBe(200);
    expect(sendHTML).not.toHaveBeenCalled();
  });
});
