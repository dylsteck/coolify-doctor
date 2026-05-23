import { describe, expect, it, vi, beforeEach } from "vitest";
import { CursorAgentError } from "@cursor/sdk";
import { appendInsightHtml, getWebhookInsight } from "./webhook_cursor_insight.js";

const hoisted = vi.hoisted(() => ({
  prompt: vi.fn(),
}));

vi.mock("@cursor/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cursor/sdk")>();
  return {
    ...actual,
    Agent: {
      ...actual.Agent,
      prompt: hoisted.prompt,
    },
  };
});

describe("getWebhookInsight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns trimmed insight from Agent.prompt on auto", async () => {
    hoisted.prompt.mockResolvedValue({
      id: "run-1",
      status: "finished",
      result: "  Deploy likely finished; check health endpoint.  ",
    });
    const ev = { success: true, event: "deployment_success", message: "" };
    const out = await getWebhookInsight(ev, JSON.stringify(ev), {
      apiKey: "k",
      cwd: "/w",
      timeoutMs: 5000,
    });
    expect(out).toBe("Deploy likely finished; check health endpoint.");
    expect(hoisted.prompt).toHaveBeenCalledWith(
      expect.stringContaining("deployment_success"),
      expect.objectContaining({
        apiKey: "k",
        model: { id: "auto" },
        local: { cwd: "/w", settingSources: [] },
      }),
    );
  });

  it("falls back to composer-2.5 when auto throws CursorAgentError", async () => {
    hoisted.prompt
      .mockRejectedValueOnce(new CursorAgentError("auto unavailable"))
      .mockResolvedValueOnce({
        id: "run-2",
        status: "finished",
        result: "Backup completed normally.",
      });
    const ev = { success: true, event: "backup_success", message: "ok" };
    const out = await getWebhookInsight(ev, JSON.stringify(ev), {
      apiKey: "k",
      cwd: "/w",
      timeoutMs: 5000,
    });
    expect(out).toBe("Backup completed normally.");
    expect(hoisted.prompt).toHaveBeenCalledTimes(2);
    expect(hoisted.prompt).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ model: { id: "composer-2.5" } }),
    );
  });

  it("returns undefined when all models fail", async () => {
    hoisted.prompt.mockRejectedValue(new CursorAgentError("nope"));
    const ev = { success: false, event: "test", message: "x" };
    const out = await getWebhookInsight(ev, JSON.stringify(ev), {
      apiKey: "k",
      cwd: "/w",
      timeoutMs: 5000,
    });
    expect(out).toBeUndefined();
  });
});

describe("appendInsightHtml", () => {
  it("escapes insight for Telegram HTML", () => {
    const html = appendInsightHtml("<b>Title</b>", 'check "logs" & metrics');
    expect(html).toContain("<b>Title</b>");
    expect(html).toContain("check &quot;logs&quot; &amp; metrics");
  });
});
