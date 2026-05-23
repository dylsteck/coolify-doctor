import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleCoolifyWebhook } from "./coolify_webhook.js";

const insightHoisted = vi.hoisted(() => ({
  getWebhookInsight: vi.fn(),
}));

vi.mock("./webhook_cursor_insight.js", () => ({
  getWebhookInsight: insightHoisted.getWebhookInsight,
  appendInsightHtml: (base: string, note: string) => `${base}\n\n💡 <i>${note}</i>`,
}));

describe("handleCoolifyWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insightHoisted.getWebhookInsight.mockResolvedValue(undefined);
  });

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

  it("appends insight when configured and insight succeeds", async () => {
    insightHoisted.getWebhookInsight.mockResolvedValue("Check the deployment logs.");
    const sendHTML = vi.fn().mockResolvedValue(undefined);
    const body = JSON.stringify({ success: true, event: "test", message: "x" });
    await handleCoolifyWebhook(
      "sec",
      "sec",
      new Request("http://localhost/webhook/sec", { method: "POST", body }),
      {
        sender: { sendHTML },
        insight: { apiKey: "k", cwd: "/w" },
      },
    );
    expect(insightHoisted.getWebhookInsight).toHaveBeenCalledTimes(1);
    expect(sendHTML).toHaveBeenCalledWith(
      expect.stringContaining("Check the deployment logs."),
    );
  });

  it("still sends base html when insight fails", async () => {
    insightHoisted.getWebhookInsight.mockRejectedValue(new Error("boom"));
    const sendHTML = vi.fn().mockResolvedValue(undefined);
    const body = JSON.stringify({ success: true, event: "test", message: "x" });
    const res = await handleCoolifyWebhook(
      "sec",
      "sec",
      new Request("http://localhost/webhook/sec", { method: "POST", body }),
      {
        sender: { sendHTML },
        insight: { apiKey: "k", cwd: "/w" },
      },
    );
    expect(res.status).toBe(200);
    expect(sendHTML).toHaveBeenCalledTimes(1);
    expect(sendHTML.mock.calls[0]![0]).toContain("Test webhook");
    expect(sendHTML.mock.calls[0]![0]).not.toContain("💡");
  });
});
