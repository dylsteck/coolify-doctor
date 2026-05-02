import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Thread } from "chat";
import type { ThreadState } from "./cursor_bridge.js";
import { withRenewingTyping } from "./renew_typing.js";

function mockThread() {
  return {
    startTyping: vi.fn().mockResolvedValue(undefined),
  } as unknown as Thread<ThreadState>;
}

describe("withRenewingTyping", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls startTyping immediately, renews on interval, clears interval when fn completes", async () => {
    const thread = mockThread();
    const fn = vi.fn(async () => {
      await new Promise<void>((r) => {
        setTimeout(r, 9500);
      });
      return "done";
    });

    const p = withRenewingTyping(thread, fn);
    expect(thread.startTyping).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4000);
    expect(thread.startTyping).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(thread.startTyping).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(p).resolves.toBe("done");
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(thread.startTyping).toHaveBeenCalledTimes(3);
  });

  it("clears interval when fn throws", async () => {
    const thread = mockThread();
    const err = new Error("boom");
    const p = withRenewingTyping(thread, async () => {
      throw err;
    });

    await expect(p).rejects.toThrow("boom");
    await vi.advanceTimersByTimeAsync(20_000);
    expect(thread.startTyping).toHaveBeenCalledTimes(1);
  });
});
