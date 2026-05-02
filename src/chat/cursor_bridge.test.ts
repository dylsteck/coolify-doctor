import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import type { Thread } from "chat";
import { CursorAgentError } from "@cursor/sdk";
import { CURSOR_MODEL_ID, runCursorOnThread, type ThreadState } from "./cursor_bridge.js";

const hoisted = vi.hoisted(() => {
  const asyncDispose = vi.fn().mockResolvedValue(undefined);
  const send = vi.fn();
  return {
    asyncDispose,
    send,
    create: vi.fn(),
    resume: vi.fn(),
  };
});

vi.mock("@cursor/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@cursor/sdk")>();
  return {
    ...actual,
    Agent: {
      ...actual.Agent,
      create: hoisted.create,
      resume: hoisted.resume,
    },
  };
});

function mockRun() {
  async function* stream(): AsyncGenerator<never> {}
  return {
    stream,
    wait: vi.fn().mockResolvedValue({ id: "run-1", status: "finished" as const }),
  };
}

function mockThread(overrides: Partial<Thread<ThreadState>> & { state?: ThreadState } = {}) {
  const { state: stateVal = {}, ...rest } = overrides;
  return {
    id: "thread-1",
    channelId: "telegram:1",
    state: Promise.resolve(stateVal),
    post: vi.fn().mockResolvedValue(undefined),
    setState: vi.fn().mockResolvedValue(undefined),
    ...rest,
  } as unknown as Thread<ThreadState>;
}

describe("runCursorOnThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const run = mockRun();
    hoisted.send.mockReturnValue(run);
    hoisted.create.mockResolvedValue({
      agentId: "agent-created",
      send: hoisted.send,
      [Symbol.asyncDispose]: hoisted.asyncDispose,
    });
    hoisted.resume.mockResolvedValue({
      agentId: "agent-resumed",
      send: hoisted.send,
      [Symbol.asyncDispose]: hoisted.asyncDispose,
    });
  });

  it("creates agent with composer-1.5 and prepends grounding on first turn", async () => {
    const thread = mockThread({ state: {} });
    await runCursorOnThread(thread, "hello", { apiKey: "k", cwd: "/w" });

    expect(hoisted.create).toHaveBeenCalledTimes(1);
    expect(hoisted.resume).not.toHaveBeenCalled();
    expect(hoisted.create).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "k",
        model: { id: CURSOR_MODEL_ID },
        local: { cwd: "/w", settingSources: [] },
      }),
    );
    expect(thread.setState).toHaveBeenCalledWith({ cursorAgentId: "agent-created" });
    expect(hoisted.send).toHaveBeenCalledTimes(1);
    const firstArg = (hoisted.send as Mock).mock.calls[0][0] as string;
    expect(firstArg).toContain("coolify-doctor Telegram bot");
    expect(firstArg).toContain("---");
    expect(firstArg).toContain("hello");
  });

  it("resumes and sends user text without grounding when cursorAgentId exists", async () => {
    const thread = mockThread({ state: { cursorAgentId: "agent-existing" } });
    await runCursorOnThread(thread, "follow up", { apiKey: "k", cwd: "/w" });

    expect(hoisted.resume).toHaveBeenCalledWith(
      "agent-existing",
      expect.objectContaining({
        apiKey: "k",
        model: { id: CURSOR_MODEL_ID },
        local: { cwd: "/w", settingSources: [] },
      }),
    );
    expect(hoisted.create).not.toHaveBeenCalled();
    expect(thread.setState).not.toHaveBeenCalled();
    expect(hoisted.send).toHaveBeenCalledWith("follow up");
  });

  it("posts friendly message on CursorAgentError from create", async () => {
    hoisted.create.mockRejectedValue(new CursorAgentError("bad key"));
    const thread = mockThread({ state: {} });
    await runCursorOnThread(thread, "hi", { apiKey: "k", cwd: "/w" });

    expect(thread.post).toHaveBeenCalledWith("Could not start Cursor agent: bad key");
    expect(hoisted.asyncDispose).not.toHaveBeenCalled();
  });

  it("disposes agent after successful run", async () => {
    const thread = mockThread({ state: {} });
    await runCursorOnThread(thread, "hi", { apiKey: "k", cwd: "/w" });
    expect(hoisted.asyncDispose).toHaveBeenCalledTimes(1);
  });
});
