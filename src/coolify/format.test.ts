import { describe, expect, it } from "vitest";
import type { CoolifyEvent } from "./event.js";
import { formatEvent } from "./format.js";

describe("formatEvent", () => {
  it("deployment", () => {
    const e: CoolifyEvent = {
      success: true,
      event: "deployment_success",
      message: "ok",
      application_name: "A",
      project: "P",
      deployment_url: "https://d.example",
    };
    const s = formatEvent(e, "");
    expect(s).toContain("Deployment");
    expect(s).toContain("A");
  });

  it("unknown includes event name", () => {
    const e: CoolifyEvent = { success: true, event: "custom_event", message: "msg" };
    const raw = JSON.stringify({ x: 1, event: "custom_event" });
    const s = formatEvent(e, raw);
    expect(s).toContain("custom_event");
  });

  it("test escapes html in message", () => {
    const e: CoolifyEvent = { success: true, event: "test", message: "hello <user>" };
    const s = formatEvent(e, "");
    expect(s).toContain("Test webhook");
    expect(s).toContain("hello &lt;user&gt;");
  });

  it("task failed", () => {
    const e: CoolifyEvent = {
      success: false,
      event: "task_failed",
      message: "m",
      task_name: "t",
      url: "https://u",
    };
    const s = formatEvent(e, "");
    expect(s.toLowerCase()).toContain("task");
  });
});
